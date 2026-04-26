import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;
  private destroySubject = new Subject<void>();

  connect(): void {
    if (this.socket?.connected) return;
    const token = localStorage.getItem('accessToken');
    this.socket = io(environment.backendUrl, {
      auth: { token },
      transports: ['websocket'],
    });
    this.socket.on('connect', () => console.log('Socket connected:', this.socket?.id));
    this.socket.on('disconnect', () => console.log('Socket disconnected'));
    this.socket.on('connect_error', (err) => console.error('Socket error:', err.message));
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  emit(event: string, data?: any): void {
    this.socket?.emit(event, data);
  }

  on<T>(event: string): Observable<T> {
    return new Observable<T>((observer) => {
      this.socket?.on(event, (data: T) => observer.next(data));
      return () => this.socket?.off(event);
    });
  }

  joinChannel(channelId: string): void {
    this.emit('join-channel', { channelId });
  }

  leaveChannel(channelId: string): void {
    this.emit('leave-channel', { channelId });
  }

  joinChat(chatId: string): void {
    this.emit('join-chat', { chatId });
  }

  leaveChat(chatId: string): void {
    this.emit('leave-chat', { chatId });
  }

  typingStart(roomId: string, type: 'channel' | 'chat'): void {
    this.emit('typing-start', { roomId, type });
  }

  typingStop(roomId: string, type: 'channel' | 'chat'): void {
    this.emit('typing-stop', { roomId, type });
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.destroySubject.next();
    this.destroySubject.complete();
  }
}
