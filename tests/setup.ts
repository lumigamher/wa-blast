process.env.DATABASE_URL = ":memory:";
process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-bytes-long-xxxx";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.RESEND_API_KEY = "re_test_key";
process.env.EMAIL_FROM = "test@example.com";
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
