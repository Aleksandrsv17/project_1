import { UserService } from '../src/services/user/user.service';
import { ConflictError, UnauthorizedError } from '../src/middleware/errorHandler';
import { query } from '../src/db';

// ── Mock dependencies ────────────────────────────────────────────────────────

jest.mock('../src/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
  pool: { end: jest.fn() },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password_mock'),
  compare: jest.fn(),
}));

jest.mock('../src/utils/jwt', () => ({
  signAccessToken: jest.fn().mockReturnValue('access_token_mock'),
  signRefreshToken: jest.fn().mockReturnValue('refresh_token_mock'),
  verifyRefreshToken: jest.fn(),
  generateJti: jest.fn().mockReturnValue('jti_mock'),
  hashToken: jest.fn().mockReturnValue('hashed_token_mock'),
  getRefreshTokenExpiresAt: jest.fn().mockReturnValue(new Date(Date.now() + 7 * 86400 * 1000)),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// ── Test setup ───────────────────────────────────────────────────────────────

const mockQuery = query as jest.MockedFunction<typeof query>;
import bcrypt from 'bcryptjs';
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const mockUser = {
  id: 'uuid-user-1',
  email: 'john@example.com',
  phone: null,
  password_hash: 'hashed_password_mock',
  role: 'customer',
  first_name: 'John',
  last_name: 'Doe',
  avatar_url: null,
  is_verified: false,
  kyc_status: 'pending',
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    jest.clearAllMocks();
  });

  // ── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should create a new user and return tokens', async () => {
      // No existing user
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // check existing
        .mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 } as any) // insert user
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)  // insert refresh token
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // cleanup expired tokens

      const result = await userService.register({
        email: 'john@example.com',
        password: 'SecurePass123!',
        first_name: 'John',
        last_name: 'Doe',
      });

      expect(result.user.email).toBe('john@example.com');
      expect(result.user).not.toHaveProperty('password_hash');
      expect(result.tokens.access_token).toBe('access_token_mock');
      expect(result.tokens.refresh_token).toBe('refresh_token_mock');
      expect(result.tokens.token_type).toBe('Bearer');
    });

    it('should throw ConflictError if email already exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }], rowCount: 1 } as any);

      await expect(
        userService.register({
          email: 'john@example.com',
          password: 'SecurePass123!',
          first_name: 'John',
          last_name: 'Doe',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should hash the password before saving', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await userService.register({
        email: 'jane@example.com',
        password: 'MySecurePassword1!',
        first_name: 'Jane',
        last_name: 'Doe',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('MySecurePassword1!', expect.any(Number));
    });
  });

  // ── login ────────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should return tokens on valid credentials', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 } as any) // find user
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // insert refresh token
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // cleanup

      (mockBcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>)
        .mockResolvedValueOnce(true as never);

      const result = await userService.login({
        email: 'john@example.com',
        password: 'SecurePass123!',
      });

      expect(result.user.email).toBe('john@example.com');
      expect(result.tokens.access_token).toBeDefined();
      expect(result.tokens.refresh_token).toBeDefined();
    });

    it('should throw UnauthorizedError for non-existent email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(
        userService.login({ email: 'notfound@example.com', password: 'pass' })
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError for wrong password', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 } as any);

      (mockBcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>)
        .mockResolvedValueOnce(false as never);

      await expect(
        userService.login({ email: 'john@example.com', password: 'WrongPassword' })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  // ── refresh ───────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should return new tokens for valid refresh token', async () => {
      const { verifyRefreshToken } = require('../src/utils/jwt');
      verifyRefreshToken.mockReturnValueOnce({ sub: 'uuid-user-1', jti: 'jti_mock' });

      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'rt-1', user_id: 'uuid-user-1', expires_at: new Date(Date.now() + 86400000) }],
          rowCount: 1,
        } as any) // find refresh token
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any) // delete old token
        .mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 } as any) // find user
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // insert new refresh token
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // cleanup

      const tokens = await userService.refresh('valid_refresh_token');

      expect(tokens.access_token).toBe('access_token_mock');
      expect(tokens.refresh_token).toBe('refresh_token_mock');
    });

    it('should throw UnauthorizedError for invalid refresh token', async () => {
      const { verifyRefreshToken } = require('../src/utils/jwt');
      verifyRefreshToken.mockImplementationOnce(() => {
        throw new Error('jwt expired');
      });

      await expect(userService.refresh('invalid_token')).rejects.toThrow(UnauthorizedError);
    });
  });

  // ── getById ───────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return the public user object', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 } as any);

      const user = await userService.getById('uuid-user-1');

      expect(user.id).toBe('uuid-user-1');
      expect(user.email).toBe('john@example.com');
      expect((user as any).password_hash).toBeUndefined();
    });

    it('should throw NotFoundError for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const { NotFoundError } = require('../src/middleware/errorHandler');
      await expect(userService.getById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update user fields and return updated user', async () => {
      const updated = { ...mockUser, first_name: 'Johnny' };
      mockQuery.mockResolvedValueOnce({ rows: [updated], rowCount: 1 } as any);

      const result = await userService.update('uuid-user-1', { first_name: 'Johnny' });

      expect(result.first_name).toBe('Johnny');
    });
  });
});
