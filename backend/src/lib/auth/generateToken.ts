import crypto from "crypto"
import jwt from "jsonwebtoken"
import { prisma } from "../prisma"

export const generateAccessToken = async ({
    userId,
    role,
}: {userId: string, role: string}) => {

    const accessToken = jwt.sign({
        id: userId,
        role
    }, process.env.ACCESS_TOKEN!, {
        expiresIn: "15m"
    })

    return accessToken
}

export const generateRefreshToken = async (userId: string) => {
     const refreshToken = crypto.randomBytes(40).toString("hex")

    await prisma.token.create({
        data: {
            token: refreshToken,
            type: "REFRESH",
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
            userId: userId
        }
    })

    return refreshToken
}

export const emailVerifyToken = async (userId: string) => {
    const token = crypto.randomBytes(40).toString("hex")

    await prisma.token.create({
        data: {
            token: token,
            type: "EMAIL_VERIFY",
            expiresAt: new Date(Date.now() + 1000 * 60 * 60),
            userId: userId
        }
    })

    return token
}

export const passResetToken = async (userId: string) => {
    const token = crypto.randomBytes(40).toString("hex")

    await prisma.token.create({
        data: {
            token: token,
            type: 'PASSWORD_RESET',
            expiresAt: new Date(Date.now() + 1000 * 60 * 60),
            userId: userId
        }
    })
    
    return token
}