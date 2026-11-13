# 3D Platform

## Kiire käivitamine Ubuntu / WSL-is

Ava Windowsis Docker Desktop ja oota, kuni see töötab. Seejärel käivita Ubuntu terminalis:

```bash
cd /code/3D-platform
docker compose up -d db

set -a
source .env
set +a

cd backend
./mvnw spring-boot:run
```

Jäta terminal avatuks. Backend töötab aadressil `http://localhost:8080`.

`.env` asub projekti juurkaustas, mitte `backend` kaustas. Laadi see igas uues backendit käivitavas terminalis uuesti. `set -a` teeb muutujad Java protsessile kättesaadavaks.

## Frontend teises terminalis

```bash
cd /code/3D-platform/frontend
npm run dev
```

Ava Vite’i väljundis näidatud aadress, tavaliselt `http://localhost:5173`. `/api` päringud suunatakse backendile pordil 8080. Kui sõltuvused pole veel paigaldatud, käivita esmalt `npm install`.

## Kui backend ei käivitu

### `Could not resolve placeholder 'DATABASE_URL'`

Keskkonnamuutujad pole selles terminalis laaditud. Kui oled juba `backend` kaustas:

```bash
set -a
source ../.env
set +a
./mvnw spring-boot:run
```

### `Connection to localhost:5432 refused`

PostgreSQL ei tööta või pole veel käivitunud:

```bash
cd /code/3D-platform
docker compose up -d db
docker compose exec db pg_isready
```

Kui vastus on `accepting connections`, käivita backend uuesti terminalis, kuhu `.env` oli laaditud. Kui vastus on `rejecting connections` või `no response`, oota hetk ja korda valmiduskontrolli.

Kui Docker ei saa daemoniga ühendust, ava Docker Desktop ja kontrolli, et selle WSL integration oleks Ubuntu jaoks lubatud.

## Peatamine

Peata backend ja frontend nende terminalides käsuga `Ctrl+C`. Andmebaasi peatamiseks:

```bash
cd /code/3D-platform
docker compose stop db
```

Andmed säilivad Dockeri `postgres_data` andmemahus. Ära kasuta tavapäraseks peatamiseks `docker compose down -v`, sest `-v` kustutab andmemahu.
