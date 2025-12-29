import nodemailer from "nodemailer"
import { SendEmailOptions } from "../types/auth.types";

// Create a transporter using Ethereal test credentials.
// For production, replace with your actual SMTP server details.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_HOST) || 587,
  secure: false, // Use true for port 465, false for port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendMail = async ({to, subject, html}: SendEmailOptions) => {
    await transporter.sendMail({
        from: `"IITCares" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html
    })
}