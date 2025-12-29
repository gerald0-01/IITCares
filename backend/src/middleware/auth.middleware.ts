import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken"
import { prisma } from "../lib/prisma";
import { generateAccessToken, generateRefreshToken } from "../lib/auth/generateToken";

export const authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers.authorization

    if (authHeader) {
        const token = authHeader.split(" ")[1]
        try {
            const payload = jwt.verify(
                token,
                process.env.ACCESS_TOKEN!
            ) as {id: string, role: string}

            req.user = {
                id: payload.id,
                role: payload.role
            };
            return next();
        } catch (err) {
            // fall through to try refresh cookie
        }
    }

    // If no valid access token, try using refresh cookie to rotate tokens
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: "No token provided" });

    try {
        const stored = await prisma.token.findUnique({ where: { token: refreshToken } });
        if (!stored || stored.expiresAt < new Date()) return res.status(401).json({ message: "Invalid refresh token" });

        const user = await prisma.user.findUnique({ where: { id: stored.userId } });
        if (!user) return res.status(401).json({ message: "User not found" });

        // Rotate refresh token
        await prisma.token.delete({ where: { token: refreshToken } });
        const newRefreshToken = await generateRefreshToken(user.id);
        const newAccessToken = await generateAccessToken({ userId: user.id, role: user.role });

        // Set new refresh cookie (httpOnly)
        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
        });

        // Expose access token in Authorization header so client (Postman) can pick it up
        res.setHeader('Authorization', `Bearer ${newAccessToken}`);

        req.user = { id: user.id, role: user.role };
        return next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}