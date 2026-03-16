# YURA AI School — 수강신청 시스템 설계

**Date:** 2026-03-16
**Stack:** Next.js 14 App Router + Supabase + Vercel
**Scope:** 수강신청 기능 (MVP)

---

## 1. 사용자 역할

| 역할 | 권한 |
|------|------|
| `admin` | 강좌/회차 CRUD, 직원 계정 생성, 수강신청 현황 조회 및 엑셀 다운로드 |
| `employee` | 강좌 조회, 수강신청, 수강변경, 수강취소 |

---

## 2. 인증

- Supabase Auth 사용
- 로그인 ID: `사번@yura.internal` (사용자에게는 사번만 입력받음)
- 초기 비밀번호: `y사번`
- 관리자가 직원 등록 시 Supabase Admin API로 계정 자동 생성

---

## 3. DB 스키마

### `profiles`
```sql
id           uuid PRIMARY KEY REFERENCES auth.users
employee_id  text UNIQUE NOT NULL   -- 사번
name         text NOT NULL
department   text NOT NULL
role         text NOT NULL DEFAULT 'employee'  -- 'admin' | 'employee'
```

### `courses`
```sql
id     uuid PRIMARY KEY DEFAULT gen_random_uuid()
title  text NOT NULL
```

### `course_sessions`
```sql
id               uuid PRIMARY KEY DEFAULT gen_random_uuid()
course_id        uuid REFERENCES courses(id) ON DELETE CASCADE
session_number   int NOT NULL          -- 회차 번호
location         text NOT NULL
course_date      date NOT NULL
enrollment_start date NOT NULL
enrollment_end   date NOT NULL
max_participants int NOT NULL
```

### `enrollments`
```sql
id          uuid PRIMARY KEY DEFAULT gen_random_uuid()
session_id  uuid REFERENCES course_sessions(id) ON DELETE CASCADE
user_id     uuid REFERENCES profiles(id) ON DELETE CASCADE
created_at  timestamptz DEFAULT now()
UNIQUE (session_id, user_id)
```

---

## 4. RLS 정책

| 테이블 | 직원 | 관리자 |
|--------|------|--------|
| profiles | 본인만 SELECT | 전체 SELECT/INSERT/UPDATE |
| courses | SELECT | 전체 CRUD |
| course_sessions | SELECT | 전체 CRUD |
| enrollments | 본인 것만 SELECT/INSERT/DELETE | 전체 SELECT |

---

## 5. 페이지 구성

### 공통
- `/login` — 사번 + 비밀번호 입력

### 직원
- `/` — 강좌 목록
  - 강좌 카드: 제목, 회차별 (장소, 날짜, 신청기간, 현재인원/최대인원)
  - `[수강신청]` — 신청 기간 내 + 정원 미달인 회차 선택 가능
  - `[수강변경]` — 이미 신청한 경우, 정원 남은 다른 회차로 변경
  - `[신청취소]` — 이미 신청한 경우

### 관리자
- `/admin/employees` — 직원 목록 + 등록 폼 (사번, 이름, 부서)
- `/admin/courses` — 강좌 목록 (회차별 신청 현황: n/max명)
- `/admin/courses/new` — 강좌 개설 (회차 1개 이상 추가)
- `/admin/courses/[id]` — 강좌 수정
- `/admin/courses/[id]/sessions/[sessionId]` — 회차별 신청자 목록 + 엑셀 다운로드 (이름, 부서, 사번)

---

## 6. 핵심 비즈니스 로직

- **수강신청 가능 조건**: `enrollment_start <= today <= enrollment_end` AND `현재 신청자 수 < max_participants`
- **수강변경**: 기존 enrollment 삭제 → 새 session enrollment 생성 (트랜잭션)
- **중복 신청 방지**: DB unique constraint + 서버 액션에서 검증
- **엑셀 다운로드**: `xlsx` 라이브러리로 서버에서 생성, 클라이언트에 스트리밍

---

## 7. 기술 스택 세부

| 항목 | 선택 |
|------|------|
| Framework | Next.js 14 App Router |
| Auth | Supabase Auth |
| DB | Supabase PostgreSQL + RLS |
| 서버 로직 | Next.js Server Actions |
| 스타일 | Tailwind CSS |
| 엑셀 | xlsx (SheetJS) |
| 배포 | Vercel |
