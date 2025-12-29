import { Router } from 'express'
import { register, login, logoout } from '../controllers/user/auth.controller'
import { verifyEmail, requestPassReset, passwordReset, refresh } from '../controllers/user/user.controller'
import { excuseVerificationController } from '../controllers/public/excuseVerification.controller'
import { motivationalQuoteController } from '../controllers/public/motivationalQuote.controller'

const publicRouter = Router()

// Auth-like public endpoints
publicRouter.post('/auth/register', register)
publicRouter.post('/auth/login', login)
publicRouter.post('/auth/logout', logoout)

// Email verification
publicRouter.get('/auth/verify-email', verifyEmail)
publicRouter.post('/auth/verify-email', verifyEmail)

// Password reset
publicRouter.post('/auth/request-password-reset', requestPassReset)
publicRouter.post('/auth/password-reset', passwordReset)

// Token refresh
publicRouter.post('/auth/refresh', refresh)

// Public: excuse verification (scanners)
publicRouter.post('/excuses/verify/:qrCode', excuseVerificationController.verifyExcuse)

// Public: motivational quotes
publicRouter.get('/quotes/random', motivationalQuoteController.getRandomQuote)
publicRouter.get('/quotes', motivationalQuoteController.getAllQuotes)

export default publicRouter

