import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";
import { Role, userStatus } from "@prisma/client";
import { bearer, emailOTP } from "better-auth/plugins";
import { sendEmail } from "../utils/email.js";
import { envVars } from "../config/env.js";

// Helper to convert duration string (e.g., "1d", "7h", "30m", "10s") to seconds
function durationToSeconds(duration: string): number {
  const value = parseInt(duration, 10);
  if (duration.endsWith('d')) return value * 24 * 60 * 60;
  if (duration.endsWith('h')) return value * 60 * 60;
  if (duration.endsWith('m')) return value * 60;
  if (duration.endsWith('s')) return value;
  // If just a number, treat as seconds
  return isNaN(value) ? 60 * 60 * 24 : value;
}

// Helper to convert duration string to milliseconds
function durationToMs(duration: string): number {
  return durationToSeconds(duration) * 1000;
}

export const auth = betterAuth({
  baseURL: envVars.BETTER_AUTH_URL,
  secret: envVars.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  socialProviders:{
    google:{
        clientId: envVars.GOOGLE_CLIENT_ID,
        clientSecret: envVars.GOOGLE_CLIENT_SECRET,
        callbackURL: envVars.GOOGLE_CALLBACK_URL,
        mapProfileToUser: (profile) => {
            return {
                role : Role.USER,
                status : userStatus.ACTIVE,
                needPasswordChange : false,
                emailVerified : true,
                isDeleted : false,
                deletedAt : null,
                image: profile.picture || undefined,
            }
        }
    }
},
  emailVerification:{
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
},
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: Role.USER,
      },
      status: {
        type: "string",
        defaultValue: userStatus.PENDING_VERIFICATION,
      },
      needPasswordChange: {
        type: "boolean",
        defaultValue: false,
      },
      isDeleted: {
        type: "boolean",
        defaultValue: false,
      },
      deletedAt: {
        type: "date",
        required: false,
      },
    },
  },
  plugins: [
    bearer(),
    emailOTP({
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({email, otp, type}) {
            if (email === envVars.SUPER_ADMIN_EMAIL) return;

            if(type === "email-verification"){
              const user = await prisma.user.findUnique({
                where : {
                    email,
                }
              })
              
              if(user && !user.emailVerified){
                await sendEmail({
                    to : email,
                    subject : "Verify your email",
                    templateName : "otp",
                    templateData :{
                        name : user.name,
                        otp,
                    }
                });
              }
            }else if(type === "forget-password"){
                const user = await prisma.user.findUnique({
                    where : {
                        email,
                    }
                })

                if(user){
                    await sendEmail({
                        to : email,
                        subject : "Password Reset OTP",
                        templateName : "otp",
                        templateData :{
                            name : user.name,
                            otp,
                        }
                    });
                }
            }
        },
        expiresIn : 2 * 60, // 2 minutes in seconds
        otpLength : 6,
    })
],

   session: {
     expiresIn: durationToSeconds(envVars.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN),
     updateAge: durationToSeconds(envVars.BETTER_AUTH_SESSION_TOKEN_UPDATE_AGE),
     cookieCache: {
       enabled: true,
       maxAge: durationToSeconds(envVars.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN),
     },
   },
  redirectURLs:{
    signIn : `${new URL(envVars.BETTER_AUTH_URL).origin}/api/v1/auth/google/success`,
},
trustedOrigins: [envVars.BETTER_AUTH_URL, envVars.FRONTEND_URL],

  advanced: {
      // disableCSRFCheck: true,
      useSecureCookies: envVars.NODE_ENV === "production",
      cookies:{
          state:{
              attributes:{
                  sameSite: envVars.NODE_ENV === "production" ? "none" : "lax",
                  secure: envVars.NODE_ENV === "production",
                  httpOnly: true,
                  path: "/",
              }
          },
          sessionToken:{
              attributes:{
                  sameSite: envVars.NODE_ENV === "production" ? "none" : "lax",
                  secure: envVars.NODE_ENV === "production",
                  httpOnly: true,
                  path: "/",
                  maxAge: durationToMs(envVars.BETTER_AUTH_SESSION_TOKEN_EXPIRES_IN),
              }
          }
      }
  }
});
