// utils/mailer.js - Nodemailer SMTP sender for OTP emails
import nodemailer from 'nodemailer';

let cachedTransporter = null;

function getTransporter(){
  if(cachedTransporter) return cachedTransporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
  return cachedTransporter;
}

export async function sendOtpMail(toEmail, otp){
  const transporter = getTransporter();
  const from = process.env.FROM_EMAIL || 'no-reply@example.com';
  const info = await transporter.sendMail({
    from,
    to: toEmail,
    subject: 'Your verification code',
    text: `Your OTP is ${otp}. It expires in 15 minutes.`,
    html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 15 minutes.</p>`
  });
  return info?.messageId || 'sent';
}
