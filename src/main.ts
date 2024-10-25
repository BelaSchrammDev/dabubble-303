import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { provideAnimations } from '@angular/platform-browser/animations';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    ...appConfig.providers,
    provideAnimations(),
    provideFirebaseApp(() => initializeApp({
      projectId: "dabubble-bela-schramm",
      appId: "1:598525654175:web:495a472052f2a357a61eaa",
      storageBucket: "dabubble-bela-schramm.appspot.com",
      // locationId: "europe-west3",
      apiKey: "AIzaSyBP1mW7yRMYVouwQqUTWbtdNKdGDkj1btA",
      authDomain: "dabubble-bela-schramm.firebaseapp.com",
      messagingSenderId: "598525654175"
    })),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideStorage(() => getStorage())
  ],
}).catch((err) => console.error(err));
