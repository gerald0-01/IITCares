import { Request, Response } from "express";
import { registerType } from "../../types/auth.types";
import { checkPassword } from "../../lib/auth/checkPassword";
import { emailVerifyToken, generateAccessToken, generateRefreshToken } from "../../lib/auth/generateToken";
import { prisma } from "../../lib/prisma";
import { sendMail } from "../../lib/emailer";
import { comparePassword } from "../../lib/auth/bcrypt";

export const register = async (req: Request<{}, {}, registerType>, res: Response) => {
    try {
        const { email, password } = req.body
    
        if (!email || !password) return res.status(401).json({message: "Don't leave blanks!"})

        //Check Email
        if (await prisma.user.findUnique({where: {email}})) return res.status(401).json({message: "Email already used!"})
        if (!email.endsWith("@g.msuiit.edu.ph")) return res.status(401).json({message: "Use your MyIIT email!"})

        //Check Password
        const check = checkPassword(password)
        if (check != "") return res.status(401).json({message: check})

        const user = await prisma.user.create({data: {email, password}})

        const token = await emailVerifyToken(user.id)
        console.log("Sending verification email to:", email);
        await sendMail({
            to: email,
            subject: "Verify your account",
            html: `
                <p>Hi!</p>
                <p>Click the link below to verify your account:</p>
                <a href="${process.env.FRONTEND_URL}/auth/verify-email?token=${token}">Verify Email</a>
                <p>This link expires in 1 hour.</p>
            `
        })
        console.log("Email sent");

        res.status(200).json({message: "Check your inbox for your email verification."})
    } catch (err) {
        console.log("Registration Error: " + err)
        res.status(500).json({
            error: err
        })
    }
}

export const login = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body
        const loggedIn = req.user

        if (loggedIn) return res.status(400).json({message: "You're already logged in!"})

        //Check if all fields aren't blank
        if (!email || !password) return res.status(400).json({message: "Don't leave blanks."})

        //Check if user exist
        const user = await prisma.user.findUnique({where: {email}})
        if (!user) return res.status(400).json({message: "Invalid Credentials."})

        //Check if password is correct
        const check = await comparePassword(password, user.password)
        if (!check) return res.status(400).json({message: "Invalid Credentials."})

        //Check if email is verified
        if (!user.emailVerified) {
            const token = await emailVerifyToken(user.id)
            console.log("Sending verification email to:", email);
            await sendMail({
                to: email,
                subject: "Verify your account",
                html: `
                    <p>Hi!</p>
                    <p>Click the link below to verify your account:</p>
                    <a href="${process.env.FRONTEND_URL}/auth/verify-email?token=${token}">Verify Email</a>
                    <p>This link expires in 1 hour.</p>
                `
            })
            console.log("Email sent");
            return res.status(400).json({message: "Email not verified yet. Verify now"})
        }

        //Generate Tokens
        const refreshToken = await generateRefreshToken(user.id)
        const accessToken = await generateAccessToken({userId: user.id, role: user.role})

        
        // Set cookies for Postman/manual testing
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: false, // true in prod
            sameSite: "lax",
        });
        // Provide access token in Authorization header for testing
        res.setHeader('Authorization', `Bearer ${accessToken}`);

        res.status(200).json({
            message: "User logged in successfully!",
            accessToken,
            refreshToken
        })
    } catch (err) {
        console.log("Login Error: " +  err)
        res.status(500).json({error: err})
    }
}


export const logoout = async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;

        await prisma.token.deleteMany({
            where: { token: refreshToken }
        });

        res.json({ message: "Logged out" });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Failed to log out user!' });
    }
}
