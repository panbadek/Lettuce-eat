# 🥬 Lettuce Eat

Prosta aplikacja w stylu [Lettuce Meet](https://lettucemeet.com) – bez kont i logowania, wystarczy link.

## Co potrafi

### 📅 Spotkanie
1. Organizator wpisuje nazwę i w **kalendarzu** wybiera możliwe dni (klik lub przeciągnięcie).
2. Ustawia zakres godzin **od–do** i w siatce **30-minutowych segmentów** zaznacza możliwe terminy
   (przeciąganie zaznacza prostokąt – kilka dni i godzin jednym ruchem).
3. Aplikacja tworzy **link** – do skopiowania albo udostępnienia (na telefonie natywne „Udostępnij”).
4. Każdy z linkiem podaje **imię** i zaznacza terminy, które mu pasują (tylko spośród zaproponowanych).
5. **Mapa cieplna** pokazuje, ile osób może w danym terminie; po najechaniu/kliknięciu widać kto może, a kto nie.
   Kliknięcie imienia podświetla terminy tej osoby. Lista **najlepszych terminów** jest wyliczana automatycznie.

### 🍕 Posiłek
1. Organizator tworzy posiłek (np. „Kolacja w piątek”) i dostaje link.
2. Każdy z linkiem podaje **imię** i ile zje – w wybranej jednostce, z dokładnością do **jednego miejsca po przecinku**
   (działa zarówno `2,5`, jak i `2.5`):
   - 🥪 połówki tosta
   - 🌭 małe hot dogi z Żabki
   - 🍕 kawałki średniej pizzy
3. Wartości są przeliczane między jednostkami: **1 hot dog = 4 połówki tosta = 3 kawałki pizzy**.
4. Na dole widać **sumę** we wszystkich trzech jednostkach (plus całe tosty i całe pizze po 8 kawałków).

W obu przypadkach wpisanie **tego samego imienia** (wielkość liter nie ma znaczenia) wczytuje i nadpisuje
wcześniejszą odpowiedź. Strony same odświeżają się co 15 s, więc widać nowe odpowiedzi na bieżąco.

## Uruchomienie

Wymagany **Node.js 22.13+** (korzysta z wbudowanego `node:sqlite`, więc nie ma natywnych zależności).

```bash
npm install
npm start          # http://localhost:3000
```

Zmienne środowiskowe:

| Zmienna   | Domyślnie                 | Opis                     |
|-----------|---------------------------|--------------------------|
| `PORT`    | `3000`                    | port serwera             |
| `DB_PATH` | `./data/lettuce-eat.db`   | plik bazy SQLite         |

Testy: `npm test`

Żeby link działał dla znajomych, aplikacja musi stać pod publicznym adresem – np. na VPS-ie albo na
Render / Railway / Fly.io (z trwałym dyskiem na plik bazy).

## Struktura

```
src/server.js        API (Express) + serwowanie frontendu
src/db.js            schemat i zapytania SQLite
public/index.html    powłoka aplikacji (SPA, bez kroku budowania)
public/js/           strony: tworzenie, spotkanie, posiłek; kalendarz i siatka godzin
public/shared/       logika wspólna dla przeglądarki i serwera (sloty, przeliczniki jedzenia)
test/                testy API i logiki (node:test)
```

## API

| Metoda   | Ścieżka                                | Body                                  |
|----------|----------------------------------------|---------------------------------------|
| `POST`   | `/api/meetings`                        | `{ title, slots: ["2026-10-14T17:00", …] }` |
| `GET`    | `/api/meetings/:id`                    |                                       |
| `PUT`    | `/api/meetings/:id/responses`          | `{ name, slots }`                     |
| `DELETE` | `/api/meetings/:id/responses/:name`    |                                       |
| `POST`   | `/api/meals`                           | `{ title }`                           |
| `GET`    | `/api/meals/:id`                       |                                       |
| `PUT`    | `/api/meals/:id/entries`               | `{ name, amount, unit: "toast" \| "hotdog" \| "pizza" }` |
| `DELETE` | `/api/meals/:id/entries/:name`         |                                       |
