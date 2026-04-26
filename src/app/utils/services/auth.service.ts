import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SocketService } from './socket.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: any;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private socketService = inject(SocketService);

  // ── Token-Management ──────────────────────────────────────────────────────

  saveTokens(tokens: AuthTokens): void {
    localStorage.setItem('accessToken', tokens.accessToken);
    localStorage.setItem('refreshToken', tokens.refreshToken);
  }

  clearTokens(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('currentUserId');
  }

  getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  isLoggedIn(): boolean {
    return !!this.getAccessToken();
  }

  // ── Auth-Endpunkte ────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password })
    );
    this.saveTokens(response);
    localStorage.setItem('currentUserId', response.user.id);
    this.socketService.connect();
    return response;
  }

  async register(name: string, email: string, password: string): Promise<{ message: string }> {
    return firstValueFrom(
      this.http.post<{ message: string }>(`${environment.apiUrl}/auth/register`, { name, email, password })
    );
  }

  async loginAsGuest(): Promise<LoginResponse> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login/guest`, {})
    );
    this.saveTokens(response);
    localStorage.setItem('currentUserId', response.user.id);
    localStorage.setItem('isGuest', 'true');
    this.socketService.connect();
    return response;
  }

  async logout(): Promise<void> {
    try {
      const token = this.getAccessToken();
      if (token) {
        await firstValueFrom(
          this.http.post(`${environment.apiUrl}/auth/logout`, {}, {
            headers: { Authorization: `Bearer ${token}` },
          })
        );
      }
    } catch { /* ignorieren – Token evtl. abgelaufen */ }
    this.socketService.disconnect();
    this.clearTokens();
    localStorage.removeItem('isGuest');
  }

  async refreshTokens(): Promise<boolean> {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) return false;
      const response = await firstValueFrom(
        this.http.post<AuthTokens>(`${environment.apiUrl}/auth/refresh`, { refreshToken })
      );
      this.saveTokens(response);
      return true;
    } catch {
      this.clearTokens();
      return false;
    }
  }

  async verifyEmail(token: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/auth/verify-email`, { token })
    );
  }

  async forgotPassword(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/auth/forgot-password`, { email })
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/auth/reset-password`, { token, newPassword })
    );
  }

  async resendVerification(): Promise<void> {
    const accessToken = this.getAccessToken();
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/auth/resend-verification`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );
  }

  getCurrentUserId(): string | null {
    return localStorage.getItem('currentUserId');
  }

  isGuest(): boolean {
    return localStorage.getItem('isGuest') === 'true';
  }

  // Google OAuth – Browser wird zu Backend weitergeleitet, Callback setzt Token
  loginWithGoogle(): void {
    window.location.href = `${environment.apiUrl}/auth/google`;
  }
}
