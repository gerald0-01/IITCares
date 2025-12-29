import { Request, Response } from "express"
import { prisma } from "../../lib/prisma"
import { generateAccessToken, generateRefreshToken, passResetToken } from "../../lib/auth/generateToken"
import { sendMail } from "../../lib/emailer"
import { hashPassword } from "../../lib/auth/bcrypt"

export const verifyEmail = async (req: Request, res: Response) => {
    try {
        const token = req.query.token as string || req.body.token as string

        if (!token) return res.status(400).json({message: "Token required"})

        const record = await prisma.token.findUnique({where: {token}})
        if (!record || record.expiresAt < new Date()) return res.status(400).json({message: "Invalid or expired token."})

        await prisma.user.update({where: {id: record.userId}, data: {emailVerified: true}})
        await prisma.token.delete({where: {id: record.id}})
        
        res.status(200).json({message: "Email verified successfully."})
    } catch (err) {
        console.log("Email Verification Error: " + err)
        res.status(500).json({error: err})
    }
}

export const requestPassReset = async (req: Request, res: Response) => {
    const { email } = req.body
    if (!email) return res.status(400).json({message: "Enter your email!"})

    const user = await prisma.user.findUnique({where: {email}})
    if (!user) return res.status(400).json({message: "User doesn't exist"})

    const token = await passResetToken(user.id)
    await sendMail({
        to: email,
            subject: "Password Reset",
            html: `
                <p>Hi!</p>
                <p>Click the link below to reset your password:</p>
                <a href="${process.env.FRONTEND_URL}/auth/password-reset?token=${token}">Reset Password</a>
                <p>This link expires in 1 hour.</p>
            `
    })
    res.status(200).json({message: "Check your inbox for password reset link."})
}

export const passwordReset = async (req: Request, res: Response) => {
    try {
        const token = req.query.token as string || req.body.token as string

        if (!token) return res.status(400).json({message: "Token required"})

        const record = await prisma.token.findUnique({where: {token}})
        if (!record || record.expiresAt < new Date()) return res.status(400).json({message: "Invalid or expired token."})

        const { newPassword } = req.body

        const password = await hashPassword(newPassword)

        await prisma.user.update({where: {id: record.userId}, data: {password}})

        res.status(200).json({message: "Password updated successfully."})
    } catch (err) {
        console.log("Password Reset Error: " + err)
        res.status(500).json({error: err})
    }
}

export const refresh = async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
        return res.status(401).json({ message: "Missing refresh token" });
    }

    const storedToken = await prisma.token.findUnique({
        where: { token: refreshToken }
    });

    console.log(refreshToken)

    if (!storedToken || storedToken.expiresAt < new Date()) {
        return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await prisma.user.findUnique({where: {id: storedToken.userId}})

    if (!user) return res.status(400).json({message: "User not found!"})

    // 🔄 ROTATE
    await prisma.token.delete({
        where: { token: refreshToken }
    });

    const newRefreshToken = await generateRefreshToken(user.id)
    const accessToken = await generateAccessToken({userId: user.id, role: user.role})

        
    // Set cookies so Postman can persist tokens between requests
    res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: false, // true in prod
        sameSite: "lax",
    });
    // Provide access token in Authorization header
    res.setHeader('Authorization', `Bearer ${accessToken}`);

    res.json({ accessToken, refreshToken: newRefreshToken })
};

export const updateRole = async (req: Request, res: Response) => {
    try {
        const { role } = req.body
        const id = req.user?.id

        console.log(id)
        await prisma.user.update({
            where: {id},
            data: {role}
        })
        res.sendStatus(200)
    } catch (error) {
        console.log("Update Role Error: " + error)
        res.status(500).json({message: "Failed to update role"})
    }
}