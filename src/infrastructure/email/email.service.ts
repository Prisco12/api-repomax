import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transport;
  constructor(private readonly config: ConfigService) {
    const user = config.get<string>('MAIL_USER');
    const password = config.get<string>('MAIL_PASSWORD');
    this.transport = nodemailer.createTransport({
      host: config.getOrThrow<string>('MAIL_HOST'),
      port: config.getOrThrow<number>('MAIL_PORT'),
      secure: config.getOrThrow<boolean>('MAIL_SECURE'),
      auth: user && password ? { user, pass: password } : undefined,
    });
  }
  sendVerification(to: string, token: string) {
    return this.sendAccountEmail({
      to,
      subject: 'Confirme seu e-mail',
      title: 'Confirme seu e-mail',
      message: 'Confirme seu endereço para liberar o acesso à sua conta.',
      button: 'Confirmar e-mail',
      validity: 'Este link é válido por 24 horas.',
      path: '/verify-email',
      token,
    });
  }
  sendPasswordReset(to: string, token: string) {
    return this.sendAccountEmail({
      to,
      subject: 'Redefina sua senha',
      title: 'Redefinição de senha',
      message: 'Use o botão abaixo para escolher uma nova senha.',
      button: 'Redefinir senha',
      validity:
        'Este link é válido por uma hora. Ignore esta mensagem se você não solicitou a alteração.',
      path: '/reset-password',
      token,
    });
  }

  private sendAccountEmail(input: {
    to: string;
    subject: string;
    title: string;
    message: string;
    button: string;
    validity: string;
    path: string;
    token: string;
  }) {
    const url = new URL(
      input.path,
      this.config.getOrThrow<string>('FRONTEND_URL'),
    );
    url.searchParams.set('token', input.token);
    const link = url.toString();
    const text = `${input.title}\n\n${input.message}\n\n${link}\n\n${input.validity}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px;">
        <h1 style="font-size: 24px;">${input.title}</h1>
        <p>${input.message}</p>
        <p style="margin: 32px 0;">
          <a
            href="${link}"
            style="background: #2563eb; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 6px;"
          >
            ${input.button}
          </a>
        </p>
        <p style="color: #475569;">${input.validity}</p>
        <p style="font-size: 12px; color: #64748b; word-break: break-all;">${link}</p>
      </div>
    `;
    return this.transport.sendMail({
      from: this.config.getOrThrow<string>('MAIL_FROM'),
      to: input.to,
      subject: input.subject,
      text,
      html,
    });
  }
}
