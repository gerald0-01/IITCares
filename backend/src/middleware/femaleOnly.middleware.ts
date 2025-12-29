import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

export const femaleOnly = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "No user found!" });
      }

      // Use findUnique since userId is unique
      const profile = await prisma.studentProfile.findUnique({
        where: { userId: user.id },
        select: { sex: true },
      });

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      if (profile.sex !== "FEMALE") {
        return res.status(403).json({
          message: "Menstrual cycle tracking is only available for female users",
        });
      }

      // Everything is fine → call next
      next();
    } catch (error) {
      console.error("femaleOnly middleware error:", error);
      return res.status(500).json({ message: "Internal server error" });
    };
};
