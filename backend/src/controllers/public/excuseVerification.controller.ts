import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma'; // Prisma client instance
import { ExcuseStatus } from '../../../generated/prisma/client'; // Enum

export const excuseVerificationController = {
  // Verify excuse (Faculty/Public scan)
  async verifyExcuse(req: Request, res: Response) {
    try {
      const { qrCode } = req.params;
      const { facultyName, facultyId } = req.body;

      if (!facultyName) {
        return res.status(400).json({ error: 'Faculty name required' });
      }

      const excuse = await prisma.digitalExcuse.findUnique({
        where: { qrCode },
        include: {
          user: {
            select: {
              studentProfile: {
                select: {
                  name: true,
                  studentNumber: true,
                  yearLevel: true,
                  course: true,
                  department: { select: { name: true, code: true } }
                }
              }
            }
          }
        }
      });

      if (!excuse) {
        return res.status(404).json({ 
          valid: false,
          error: 'Invalid excuse code' 
        });
      }

      // Check if expired
      if (new Date() > excuse.validUntil) {
        return res.status(400).json({ 
          valid: false,
          error: 'Excuse has expired',
          expiredOn: excuse.validUntil
        });
      }

      // Check if revoked
      if (excuse.status === ExcuseStatus.REVOKED) {
        return res.status(400).json({ 
          valid: false,
          error: 'Excuse has been revoked' 
        });
      }

      // Check if already used
      if (excuse.status === ExcuseStatus.USED) {
        return res.status(400).json({ 
          valid: false,
          error: 'Excuse already used',
          usedBy: excuse.scannedBy,
          usedAt: excuse.scannedAt
        });
      }

      // Mark as used
      const updated = await prisma.digitalExcuse.update({
        where: { id: excuse.id },
        data: {
          status: ExcuseStatus.USED,
          scannedBy: facultyId ? `${facultyName} (${facultyId})` : facultyName,
          scannedAt: new Date()
        }
      });

      // Return ONLY public information
      res.json({
        valid: true,
        student: excuse.user.studentProfile,
        reason: excuse.publicReason,
        excuseDate: excuse.excuseDate,
        validUntil: excuse.validUntil,
        scannedAt: updated.scannedAt,
        scannedBy: updated.scannedBy
      });
    } catch (error) {
      console.error('Verify excuse error:', error);
      res.status(500).json({ error: 'Failed to verify excuse' });
    }
  }
};
