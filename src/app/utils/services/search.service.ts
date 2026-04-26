import { Injectable, EventEmitter } from '@angular/core';
import { BehaviorSubject, Observable, of, forkJoin } from 'rxjs';
import { map, switchMap, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { NavigationService } from './navigation.service';
import { UsersService } from './user.service';
import { ChannelService } from './channel.service';
import { MessageService } from './message.service';
import { Message } from '../../shared/models/message.class';
import { Chat } from '../../shared/models/chat.class';
import { Channel } from '../../shared/models/channel.class';
import { from } from 'rxjs';

export interface GroupedSearchResults {
  users: { text: string; type: 'user'; hasChat: boolean }[];
  channels: { text: string; type: 'channel'; hasChat: boolean }[];
  messages: { text: string; type: 'message'; hasChat: boolean; message: Message }[];
}

export interface SearchSuggestion {
  text: string;
  type: string;
  hasChat?: boolean;
  message?: Message;
  messagePath?: string;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly RECENT_SEARCHES_KEY = 'recentSearches';
  private _isContextSearchEnabled = false;

  get isContextSearchEnabled(): boolean { return this._isContextSearchEnabled; }

  private searchStateSubject = new BehaviorSubject<{
    query: string;
    context: string | null;
    contextObjectPath: string;
  }>({ query: '', context: null, contextObjectPath: '' });

  public messageScrollRequested = new EventEmitter<Message>();
  searchState$ = this.searchStateSubject.asObservable();

  constructor(
    private navigationService: NavigationService,
    private usersService: UsersService,
    private channelService: ChannelService,
    private messageService: MessageService,
  ) { }

  // ── State ──────────────────────────────────────────────────────────────────

  updateSearchQuery(query: string): void {
    this.searchStateSubject.next({ ...this.searchStateSubject.value, query });
  }

  addContextRestriction(context: string, contextObject: Channel | Chat): void {
    const path = contextObject instanceof Channel
      ? contextObject.channelMessagesPath
      : contextObject.chatMessagesPath;
    this.searchStateSubject.next({ ...this.searchStateSubject.value, context, contextObjectPath: path });
  }

  removeContextRestriction(): void {
    this.searchStateSubject.next({ ...this.searchStateSubject.value, context: null, contextObjectPath: '' });
  }

  // ── Suche ──────────────────────────────────────────────────────────────────

  getSearchSuggestions(): Observable<GroupedSearchResults> {
    return this.searchState$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((state) => {
        if (state.query.startsWith('@')) {
          return forkJoin({ users: this.searchUsers(state.query.slice(1)), channels: of([]), messages: of([]) });
        } else if (state.query.startsWith('#')) {
          return forkJoin({ users: of([]), channels: this.searchChannels(state.query.slice(1)), messages: of([]) });
        } else if (!state.query || state.query.trim().length < 3) {
          return of({ users: [], channels: [], messages: [] });
        } else if (state.context !== null) {
          return forkJoin({
            users: of([]),
            channels: of([]),
            messages: this.searchMessages(state.query, state.contextObjectPath).pipe(map((m) => m.slice(0, 5))),
          });
        } else {
          return forkJoin({
            users: this.searchUsers(state.query).pipe(map((u) => u.slice(0, 5))),
            channels: this.searchChannels(state.query).pipe(map((c) => c.slice(0, 5))),
            messages: state.query.trim().length >= 3
              ? this.searchMessages(state.query, '').pipe(map((m) => m.slice(0, 5)))
              : of([]),
          });
        }
      }),
    );
  }

  async searchByDate(date: Date): Promise<void> {
    // Datum-Suche: Nächste Nachricht vor/nach dem Datum suchen (lokal, da kein spezieller Endpunkt)
    const context = this.navigationService.getSearchContext();
    // Vereinfachte Implementierung: scrollToMessage wenn eine Message gefunden wird
  }

  private searchUsers(query: string): Observable<{ text: string; type: 'user'; hasChat: boolean }[]> {
    return of(this.usersService.users).pipe(
      map((users) => users
        .filter((u) => !u.guest && u.name.toLowerCase().includes(query.toLowerCase()))
        .map((u) => ({
          text: `@${u.name}`,
          type: 'user' as const,
          hasChat: this.channelService.getChatWithUserByID(u.id) !== undefined,
        }))
      ),
    );
  }

  private searchChannels(query: string): Observable<{ text: string; type: 'channel'; hasChat: boolean }[]> {
    return of(this.channelService.channels).pipe(
      map((channels) => channels
        .filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
        .map((c) => ({ text: `#${c.name}`, type: 'channel' as const, hasChat: true }))
      ),
    );
  }

  public searchMessages(query: string, path: string): Observable<{ text: string; type: 'message'; hasChat: boolean; message: Message }[]> {
    return from(this.messageService.searchMessages(query, path)).pipe(
      map((messages) => messages.map((message) => {
        const plain = message.content.replace(/<\/?[^>]+(>|$)/g, ' ');
        return {
          text: this.truncate(plain, query),
          type: 'message' as const,
          hasChat: true,
          message,
          messagePath: path,
        };
      })),
    );
  }

  private truncate(content: string, query: string, maxLength = 60): string {
    const lower = content.toLowerCase();
    const queryLower = query.toLowerCase();
    const index = lower.indexOf(queryLower);
    let result: string;
    if (index === -1) {
      result = content.slice(0, maxLength);
    } else if (content.length <= maxLength) {
      result = content;
    } else {
      let start = Math.max(0, index - Math.floor((maxLength - query.length) / 2));
      let end = Math.min(content.length, start + maxLength);
      if (end === content.length) start = Math.max(0, end - maxLength);
      result = content.slice(start, end);
      if (start > 0) result = '...' + result;
      if (end < content.length) result = result + '...';
    }
    return result.replace(new RegExp(query, 'gi'), (m) => `<strong>${m}</strong>`);
  }

  // ── Recent Searches ────────────────────────────────────────────────────────

  addRecentSearch(term: SearchSuggestion): void {
    if (!term.text.trim()) return;
    let searches = this.getRecentSearches();
    searches = [term, ...searches.filter((s) => s.text !== term.text)].slice(0, 5);
    localStorage.setItem(this.RECENT_SEARCHES_KEY, JSON.stringify(searches));
  }

  getRecentSearches(): SearchSuggestion[] {
    const raw = localStorage.getItem(this.RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  removeRecentSearch(term: string): void {
    const searches = this.getRecentSearches().filter((s) => s.text !== term);
    localStorage.setItem(this.RECENT_SEARCHES_KEY, JSON.stringify(searches));
  }

  // ── Hilfsmethoden ─────────────────────────────────────────────────────────

  setContextSearchEnabled(enabled: boolean): void { this._isContextSearchEnabled = enabled; }
  getCurrentContext(): string { return this.navigationService.getSearchContext(); }
  getSearchRestrictions() { return this.searchStateSubject.value; }

  getRegisteredUsers(): string[] {
    return this.usersService.users.filter((u) => !u.guest).map((u) => u.name);
  }

  getContextMembers(): string[] {
    const context = this.getCurrentContext();
    if (context.startsWith('in:#')) {
      const ch = this.channelService.channels.find((c) => c.name === context.slice(4));
      return ch ? ch.memberIDs : [];
    }
    return [];
  }

  getUserNames(userIDs: string[]): string[] {
    return userIDs.map((id) => this.usersService.getUserByID(id)?.name ?? '').filter(Boolean);
  }
}
