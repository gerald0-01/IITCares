export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
      };
    }
    interface Request {
      user?: User;
    }
  }
}