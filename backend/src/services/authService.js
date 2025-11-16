const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const {
  getRow,
  insert,
  update,
  exists,
  query
} = require('../config/database');
const {
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ConflictError
} = require('../middleware/errorHandler');
const { verifyToken, verifyRefreshToken, signToken, signRefreshToken } = require('../middleware/auth');
const { logUserAction, logSecurityEvent } = require('../utils/logger');

class AuthService {
  // Generate secure random OTP
  generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
  }

  // Hash password
  async hashPassword(password) {
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    return await bcrypt.hash(password, saltRounds);
  }

  // Compare password
  async comparePassword(candidatePassword, hashedPassword) {
    return await bcrypt.compare(candidatePassword, hashedPassword);
  }

  // Validate Bhutan CID format
  validateCID(cid) {
    // Bhutan CID format: 11 digits, starts with 1-9
    const cidRegex = /^[1-9]\d{10}$/;
    return cidRegex.test(cid);
  }

  // Validate phone number (Bhutan format)
  validatePhoneNumber(phone) {
    // Bhutan phone numbers: +97517xxxxxx, +97577xxxxxx, 17xxxxxx, 77xxxxxx
    const phoneRegex = /^(\+975)?(17|77)\d{6}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }

  // Register new user
  async register(userData) {
    const {
      full_name,
      email,
      phone_number,
      password,
      cid_number,
      date_of_birth,
      preferred_language = 'en',
      district,
      is_tourist = false,
      passport_number
    } = userData;

    // Validate input
    if (!full_name || !phone_number || !password) {
      throw new ValidationError('Full name, phone number, and password are required');
    }

    // Validate phone number
    if (!this.validatePhoneNumber(phone_number)) {
      throw new ValidationError('Invalid Bhutan phone number format');
    }

    // Validate CID for non-tourists
    if (!is_tourist && cid_number && !this.validateCID(cid_number)) {
      throw new ValidationError('Invalid Bhutan CID number format');
    }

    // Check if user already exists
    const existingUser = await getRow(
      'SELECT id FROM users WHERE phone_number = $1 OR email = $2',
      [phone_number, email]
    );

    if (existingUser) {
      throw new ConflictError('User with this phone number or email already exists');
    }

    // Hash password
    const password_hash = await this.hashPassword(password);

    // Determine student/senior/disabled status based on age
    let is_student = false;
    let is_senior_citizen = false;

    if (date_of_birth) {
      const age = this.calculateAge(date_of_birth);
      is_student = age >= 6 && age <= 25;
      is_senior_citizen = age >= 65;
    }

    // Insert new user
    const userId = await insert('users', {
      full_name,
      email: email || null,
      phone_number: phone_number.replace(/\D/g, ''), // Remove all non-digits
      password_hash,
      cid_number: cid_number || null,
      date_of_birth: date_of_birth || null,
      preferred_language,
      district: district || null,
      is_tourist,
      passport_number: passport_number || null,
      is_student,
      is_senior_citizen,
      phone_verified: false, // Will be verified via OTP
      email_verified: email ? false : true // Skip email verification if not provided
    });

    // Generate phone verification OTP
    const phoneOTP = this.generateOTP();
    await this.storeVerificationOTP(userId, 'phone', phone_number, phoneOTP);

    // TODO: Send OTP via SMS service
    // await this.sendSMS(phone_number, `Your Bhutan Bus System verification code is: ${phoneOTP}`);

    logUserAction(userId, 'user_registered', { phone_number, email, is_tourist });

    const user = await getRow(
      `SELECT id, full_name, email, phone_number, is_tourist, phone_verified, email_verified
       FROM users WHERE id = $1`,
      [userId]
    );

    return {
      user,
      requires_phone_verification: true,
      verification_otp: process.env.NODE_ENV === 'development' ? phoneOTP : null // Only in development
    };
  }

  // Login user
  async login(loginData) {
    const { phone_number, password, email } = loginData;

    if (!password || (!phone_number && !email)) {
      throw new ValidationError('Password and phone number or email are required');
    }

    // Find user
    const user = await getRow(
      'SELECT id, full_name, email, phone_number, password_hash, is_active, phone_verified, email_verified FROM users WHERE (phone_number = $1 OR email = $2) AND is_active = true',
      [phone_number, email]
    );

    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Check password
    const isPasswordValid = await this.comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      logSecurityEvent('login_failed', { phone_number, email, reason: 'invalid_password' });
      throw new AuthenticationError('Invalid credentials');
    }

    // Remove password from output
    user.password_hash = undefined;

    // Check if verification is required
    const requiresVerification = !user.phone_verified || (user.email && !user.email_verified);

    logUserAction(user.id, 'user_login', { phone_number, email });

    return {
      user,
      requires_verification,
      verification_type: !user.phone_verified ? 'phone' : 'email'
    };
  }

  // Refresh access token
  async refreshToken(refreshToken) {
    if (!refreshToken) {
      throw new AuthenticationError('Refresh token is required');
    }

    try {
      const decoded = await verifyRefreshToken(refreshToken);

      if (decoded.type !== 'refresh') {
        throw new AuthenticationError('Invalid refresh token');
      }

      const user = await getRow(
        'SELECT id, full_name, email, phone_number, is_active FROM users WHERE id = $1 AND is_active = true',
        [decoded.id]
      );

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      const accessToken = signToken(user.id);
      const newRefreshToken = signRefreshToken(user.id);

      logUserAction(user.id, 'token_refreshed');

      return {
        token: accessToken,
        refreshToken: newRefreshToken,
        expiresIn: process.env.JWT_EXPIRE || '15m'
      };
    } catch (error) {
      logSecurityEvent('token_refresh_failed', { reason: error.message });
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  // Verify phone number with OTP
  async verifyPhone(userId, otp) {
    const storedOTP = await getRow(
      'SELECT otp, expires_at FROM verification_otps WHERE user_id = $1 AND type = $2 AND is_used = false',
      [userId, 'phone']
    );

    if (!storedOTP) {
      throw new ValidationError('OTP not found or already used');
    }

    if (new Date() > new Date(storedOTP.expires_at)) {
      throw new ValidationError('OTP has expired');
    }

    if (storedOTP.otp !== otp) {
      logSecurityEvent('phone_verification_failed', { userId, reason: 'invalid_otp' });
      throw new ValidationError('Invalid OTP');
    }

    // Mark OTP as used and verify phone
    await query(
      'UPDATE verification_otps SET is_used = true WHERE user_id = $1 AND type = $2',
      [userId, 'phone']
    );

    await update('users', userId, { phone_verified: true });

    const user = await getRow(
      'SELECT id, full_name, email, phone_number, phone_verified, email_verified FROM users WHERE id = $1',
      [userId]
    );

    logUserAction(userId, 'phone_verified');

    return { user };
  }

  // Resend OTP
  async resendOTP(userId, type) {
    if (!['phone', 'email'].includes(type)) {
      throw new ValidationError('Invalid verification type');
    }

    const user = await getRow(
      `SELECT id, full_name, phone_number, email
       FROM users WHERE id = $1 AND is_active = true`,
      [userId]
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const target = type === 'phone' ? user.phone_number : user.email;
    if (!target) {
      throw new ValidationError(`${type} not found for this user`);
    }

    // Generate new OTP
    const otp = this.generateOTP();
    await this.storeVerificationOTP(userId, type, target, otp);

    // TODO: Send OTP via appropriate service
    if (type === 'phone') {
      // await this.sendSMS(target, `Your Bhutan Bus System verification code is: ${otp}`);
    } else {
      // await this.sendEmail(target, 'Verify your email', `Your verification code is: ${otp}`);
    }

    logUserAction(userId, 'otp_resent', { type, target });

    return {
      message: `OTP sent to your ${type}`,
      otp: process.env.NODE_ENV === 'development' ? otp : null // Only in development
    };
  }

  // Store verification OTP
  async storeVerificationOTP(userId, type, target, otp) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Delete any existing unused OTPs for this user and type
    await query(
      'DELETE FROM verification_otps WHERE user_id = $1 AND type = $2 AND is_used = false',
      [userId, type]
    );

    // Insert new OTP
    await query(
      'INSERT INTO verification_otps (user_id, type, target, otp, expires_at) VALUES ($1, $2, $3, $4, $5)',
      [userId, type, target, otp, expiresAt]
    );
  }

  // Calculate age from date of birth
  calculateAge(dateOfBirth) {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  // Forgot password
  async forgotPassword(identifier) {
    const user = await getRow(
      'SELECT id, full_name, email, phone_number FROM users WHERE (phone_number = $1 OR email = $1) AND is_active = true',
      [identifier]
    );

    if (!user) {
      // Don't reveal if user exists or not
      return { message: 'If an account exists, a reset code will be sent' };
    }

    const resetOTP = this.generateOTP();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    // Store reset OTP
    await query(
      'INSERT INTO password_resets (user_id, otp, expires_at) VALUES ($1, $2, $3)',
      [user.id, resetOTP, expiresAt]
    );

    // TODO: Send reset code via appropriate channel
    if (user.email) {
      // await this.sendEmail(user.email, 'Password Reset', `Your reset code is: ${resetOTP}`);
    } else {
      // await this.sendSMS(user.phone_number, `Your password reset code is: ${resetOTP}`);
    }

    logUserAction(user.id, 'password_reset_requested');

    return {
      message: 'Password reset code sent',
      reset_code: process.env.NODE_ENV === 'development' ? resetOTP : null
    };
  }

  // Reset password with OTP
  async resetPassword(resetData) {
    const { identifier, otp, new_password } = resetData;

    if (!otp || !new_password) {
      throw new ValidationError('OTP and new password are required');
    }

    const user = await getRow(
      'SELECT id FROM users WHERE (phone_number = $1 OR email = $1) AND is_active = true',
      [identifier]
    );

    if (!user) {
      throw new ValidationError('Invalid reset code');
    }

    const storedReset = await getRow(
      'SELECT id, expires_at FROM password_resets WHERE user_id = $1 AND otp = $2 AND is_used = false',
      [user.id, otp]
    );

    if (!storedReset) {
      throw new ValidationError('Invalid or expired reset code');
    }

    if (new Date() > new Date(storedReset.expires_at)) {
      throw new ValidationError('Reset code has expired');
    }

    // Hash new password
    const password_hash = await this.hashPassword(new_password);

    // Update password and mark reset as used
    await query('BEGIN');

    try {
      await update('users', user.id, { password_hash });
      await query('UPDATE password_resets SET is_used = true WHERE id = $1', [storedReset.id]);
      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

    logUserAction(user.id, 'password_reset_completed');

    return { message: 'Password reset successful' };
  }

  // Change password (for authenticated users)
  async changePassword(userId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
      throw new ValidationError('Current password and new password are required');
    }

    const user = await getRow(
      'SELECT password_hash FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await this.comparePassword(currentPassword, user.password_hash);
    if (!isCurrentPasswordValid) {
      logSecurityEvent('password_change_failed', { userId, reason: 'invalid_current_password' });
      throw new AuthenticationError('Current password is incorrect');
    }

    // Hash new password
    const password_hash = await this.hashPassword(newPassword);
    await update('users', userId, { password_hash });

    logUserAction(userId, 'password_changed');

    return { message: 'Password changed successfully' };
  }

  // Logout user
  async logout(userId) {
    // TODO: Implement token blacklisting if needed
    logUserAction(userId, 'user_logout');
    return { message: 'Logged out successfully' };
  }
}

module.exports = new AuthService();