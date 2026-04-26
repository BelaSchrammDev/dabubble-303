import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  private get headers(): HttpHeaders {
    const token = localStorage.getItem('accessToken');
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(`${environment.apiUrl}${path}`, { headers: this.headers });
  }

  post<T>(path: string, body: any): Observable<T> {
    return this.http.post<T>(`${environment.apiUrl}${path}`, body, { headers: this.headers });
  }

  patch<T>(path: string, body: any): Observable<T> {
    return this.http.patch<T>(`${environment.apiUrl}${path}`, body, { headers: this.headers });
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${environment.apiUrl}${path}`, { headers: this.headers });
  }

  postFormData<T>(path: string, formData: FormData): Observable<T> {
    const token = localStorage.getItem('accessToken');
    const headers = token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
    return this.http.post<T>(`${environment.apiUrl}${path}`, formData, { headers });
  }
}
