import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    return res.status(401).json({ message: "No access token provided" });
  }

  try {
    const payload = jwt.verify(
      accessToken,
      process.env.ACCESS_TOKEN!
    ) as { id: string; role: string };

    req.user = {
      id: payload.id,
      role: payload.role,
    };

    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired access token" });
  }
};
