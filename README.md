# NogaGel · הכסף של נגה 💅

אפליקציה לניהול הכנסות והוצאות של עסק לק ג'ל. גרסה 1.1.0.

## מבנה הקבצים
- `index.html`, `style.css`, `app.js` – הקבצים שמשתנים בעדכונים
- `assets/` – קבצים שכמעט לא משתנים (הגדרות Firebase, אייקונים, manifest)

## מצב מקומי (בלי Firebase)
כל עוד `assets/firebase-config.js` ריק, האפליקציה עובדת ושומרת הכל בטלפון עצמו.
אפשר להעלות ל-GitHub Pages ולהתחיל להשתמש מיד. כדאי לעשות "גיבוי" מההגדרות מדי פעם.

## חיבור ל-Firebase (מומלץ: גיבוי בענן + כניסה מכמה מכשירים)
1. ב-[Firebase Console](https://console.firebase.google.com) ליצור פרויקט חדש (למשל `nogagel`).
2. **Authentication → Sign-in method** → להפעיל **Google** (לבחור support email ולשמור).
3. **Firestore Database → Create database** (production mode).
4. **Firestore → Rules** → להדביק ולפרסם:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
5. **Project settings → Your apps → Web (</>)** → להעתיק את ה-config ולהדביק ב-`assets/firebase-config.js`.
6. **Authentication → Settings → Authorized domains** → להוסיף את `<username>.github.io`.

> אם נגה כבר הכניסה נתונים במצב מקומי: לפני החיבור – הגדרות → גיבוי. בכניסה הראשונה עם Google האפליקציה תציע להעביר את הנתונים מהטלפון לחשבון אוטומטית.

## הוספה למסך הבית
אייפון: Safari → שיתוף → "הוסף למסך הבית". אנדרואיד: Chrome → ⋮ → "הוספה למסך הבית".
