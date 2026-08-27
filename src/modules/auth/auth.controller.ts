import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from './domain/authenticated-user.interface';
import { AuditContext } from '../audit/audit.types';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Cadastrar usuário',
    description: 'Cria um usuário com a role padrão `user`.',
  })
  @ApiCreatedResponse({
    description:
      'Usuário criado. A resposta segue o envelope { success, data, meta }.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'ae12f0f5-b1f6-4a6e-bb21-f0ff39ec17ac',
          email: 'user@example.com',
          emailVerificationRequired: true,
        },
        meta: { requestId: 'ec708c60-9e0e-409e-937a-52a76680f2c1' },
      },
    },
  })
  @ApiConflictResponse({
    description: 'Já existe usuário com o e-mail informado.',
  })
  @ApiBadRequestResponse({
    description:
      'Payload inválido. details informa o campo, um código estável e os requisitos ausentes.',
    schema: {
      example: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            {
              field: 'password',
              code: 'PASSWORD_TOO_WEAK',
              message:
                'Password must contain at least 12 characters, one lowercase letter, one uppercase letter, one special character.',
            },
          ],
        },
        meta: {
          requestId: '017df214-c4e1-494a-9dbf-fb625a2726e7',
          timestamp: '2026-08-26T17:09:19.447Z',
          path: '/api/v1/auth/register',
        },
      },
    },
  })
  @ApiTooManyRequestsResponse({
    description: 'Limite de cadastros ou tentativas atingido.',
  })
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.auth.register(dto, this.context(request));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirmar e-mail' })
  @ApiNoContentResponse({
    description: 'E-mail confirmado. O token é de uso único.',
  })
  @ApiBadRequestResponse({ description: 'Token inválido ou expirado.' })
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto, @Req() request: Request) {
    await this.auth.verifyEmail(dto.token, this.context(request));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reenviar confirmação de e-mail' })
  @ApiNoContentResponse({
    description:
      'Solicitação processada sem revelar se o e-mail está cadastrado.',
  })
  @Post('resend-verification')
  async resendVerification(
    @Body() dto: ResendVerificationDto,
    @Req() request: Request,
  ) {
    await this.auth.resendVerification(dto.email, this.context(request));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Solicitar redefinição de senha' })
  @ApiNoContentResponse({
    description:
      'Solicitação processada sem revelar se o e-mail está cadastrado.',
  })
  @Post('forgot-password')
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ) {
    await this.auth.forgotPassword(dto.email, this.context(request));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Redefinir senha' })
  @ApiNoContentResponse({
    description:
      'Senha redefinida, token consumido e todos os refresh tokens anteriores revogados.',
  })
  @ApiBadRequestResponse({
    description:
      'Token inválido/expirado ou senha fora da política informada no DTO.',
  })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    await this.auth.resetPassword(
      dto.token,
      dto.password,
      this.context(request),
    );
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @ApiOperation({
    summary: 'Autenticar',
    description:
      'Retorna um access token e envia o refresh token no cookie HttpOnly `refresh_token`.',
  })
  @ApiOkResponse({
    description:
      'Login efetuado. data contém accessToken e user; Set-Cookie contém refresh_token.',
    headers: {
      'Set-Cookie': {
        description:
          'refresh_token HttpOnly; SameSite=Lax; Path=/api/v1/auth; Secure em produção.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Credenciais inválidas ou bloqueio temporário por tentativas.',
  })
  @ApiTooManyRequestsResponse({
    description: 'Limite de tentativas de login atingido.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(dto, this.context(request)).then((result) => {
      this.setRefreshCookie(response, result.refreshToken);
      return { accessToken: result.accessToken, user: result.user };
    });
  }
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Renovar sessão',
    description:
      'Lê o cookie HttpOnly refresh_token, rotaciona-o e retorna um novo access token.',
  })
  @ApiOkResponse({
    description:
      'Sessão renovada; o token recebido é revogado e um novo refresh_token é enviado em Set-Cookie.',
    headers: {
      'Set-Cookie': {
        description: 'Novo refresh_token após rotação da sessão.',
        schema: { type: 'string' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Cookie ausente, inválido, expirado ou revogado.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth
      .refresh(this.refreshToken(request), this.context(request))
      .then((result) => {
        this.setRefreshCookie(response, result.refreshToken);
        return { accessToken: result.accessToken, user: result.user };
      });
  }
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: 'Encerrar sessão',
    description:
      'Revoga a sessão do refresh token recebido no cookie e remove o cookie.',
  })
  @ApiNoContentResponse({ description: 'Sessão encerrada.' })
  @ApiUnauthorizedResponse({
    description: 'Access token ou refresh cookie inválido.',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(
      this.refreshToken(request),
      user.id,
      this.context(request),
    );
    response.clearCookie('refresh_token', this.cookieOptions());
  }

  private context(request: Request): AuditContext {
    return {
      requestId: request.requestId,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    };
  }

  private refreshToken(request: Request) {
    const value = request.headers.cookie
      ?.split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith('refresh_token='))
      ?.slice('refresh_token='.length);
    if (!value) throw new UnauthorizedException('Refresh token is required');
    return decodeURIComponent(value);
  }

  private setRefreshCookie(response: Response, value: string) {
    response.cookie('refresh_token', value, this.cookieOptions());
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.getOrThrow<string>('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/api/v1/auth',
      maxAge:
        this.config.getOrThrow<number>('JWT_REFRESH_TTL_DAYS') * 86_400_000,
    };
  }
}
