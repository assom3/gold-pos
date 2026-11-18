import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        name: string;
        username: string;
        role: Role;
      };
    }
  }
}

export {};
