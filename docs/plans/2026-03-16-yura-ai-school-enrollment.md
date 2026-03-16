# YURA AI School — 수강신청 시스템 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 직원이 강좌 회차별로 수강신청/변경/취소하고, 관리자가 강좌·직원·신청현황을 관리하는 웹앱 구축

**Architecture:** Next.js 14 App Router + Server Actions으로 서버 로직 처리. Supabase Auth + RLS로 인증/권한 관리. 관리자 전용 작업(계정 생성 등)은 service role key를 서버 액션에서만 사용.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase (Auth + PostgreSQL + RLS), xlsx (SheetJS), Vercel

---

## 사전 준비 (수동 작업 — Claude가 할 수 없음)

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. Project Settings → API에서 다음 값 복사:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. [Vercel](https://vercel.com)에서 새 프로젝트 연결 준비 (Task 1 이후)

---

## Task 1: Next.js 프로젝트 생성

**Files:**
- Create: `package.json`, `src/` 디렉토리 전체

**Step 1: 프로젝트 생성**

현재 디렉토리(`YURA AI School/`)에서 실행:
```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-git --import-alias "@/*"
```
프롬프트가 나오면 모두 기본값(Enter)으로 진행.

**Step 2: 추가 패키지 설치**

```bash
npm install @supabase/supabase-js @supabase/ssr xlsx
npm install -D @types/node
```

**Step 3: .env.local 생성**

```
NEXT_PUBLIC_SUPABASE_URL=여기에_붙여넣기
NEXT_PUBLIC_SUPABASE_ANON_KEY=여기에_붙여넣기
SUPABASE_SERVICE_ROLE_KEY=여기에_붙여넣기
```

**Step 4: 개발 서버 실행 확인**

```bash
npm run dev
```
Expected: `http://localhost:3000` 에서 Next.js 기본 페이지 표시

**Step 5: 기본 파일 정리**

`src/app/page.tsx` 내용을 다음으로 교체 (임시):
```tsx
export default function Home() {
  return <div>YURA AI School</div>
}
```
`src/app/globals.css`에서 기본 Next.js 스타일 전부 삭제, 아래만 남김:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## Task 2: Supabase 스키마 및 RLS 설정

**Files:**
- Create: `supabase/schema.sql`

**Step 1: schema.sql 작성**

```sql
-- profiles 테이블
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  employee_id text unique not null,
  name text not null,
  department text not null,
  role text not null default 'employee' check (role in ('admin', 'employee'))
);

-- courses 테이블
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz default now()
);

-- course_sessions 테이블 (회차)
create table public.course_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  session_number int not null,
  location text not null,
  course_date date not null,
  enrollment_start date not null,
  enrollment_end date not null,
  max_participants int not null,
  created_at timestamptz default now()
);

-- enrollments 테이블
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.course_sessions(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (session_id, user_id)
);

-- RLS 활성화
alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.course_sessions enable row level security;
alter table public.enrollments enable row level security;

-- profiles RLS
create policy "본인 프로필 조회" on public.profiles
  for select using (auth.uid() = id);

create policy "관리자 전체 프로필 조회" on public.profiles
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "관리자 프로필 등록" on public.profiles
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- courses RLS
create policy "강좌 전체 조회" on public.courses
  for select using (true);

create policy "관리자 강좌 관리" on public.courses
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- course_sessions RLS
create policy "회차 전체 조회" on public.course_sessions
  for select using (true);

create policy "관리자 회차 관리" on public.course_sessions
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- enrollments RLS
create policy "본인 수강신청 조회" on public.enrollments
  for select using (auth.uid() = user_id);

create policy "본인 수강신청 등록" on public.enrollments
  for insert with check (auth.uid() = user_id);

create policy "본인 수강신청 취소" on public.enrollments
  for delete using (auth.uid() = user_id);

create policy "관리자 전체 수강신청 조회" on public.enrollments
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
```

**Step 2: Supabase SQL Editor에서 실행**

Supabase 대시보드 → SQL Editor → 위 SQL 전체 붙여넣기 → Run

Expected: 테이블 4개 생성, RLS 정책 적용 완료 (에러 없음)

**Step 3: 관리자 계정 수동 생성**

Supabase 대시보드 → Authentication → Users → "Add user" 클릭:
- Email: `admin@yura.internal`
- Password: `yura-admin-2026` (원하는 비밀번호)

그 다음 SQL Editor에서 profiles에 관리자 등록:
```sql
insert into public.profiles (id, employee_id, name, department, role)
values (
  '방금_생성된_user_uuid',  -- Authentication > Users에서 UUID 복사
  'admin',
  '관리자',
  '인사팀',
  'admin'
);
```

---

## Task 3: Supabase 클라이언트 유틸리티

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/middleware.ts`

**Step 1: 브라우저용 클라이언트**

`src/lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 2: 서버용 클라이언트**

`src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

**Step 3: 관리자용 클라이언트 (service role)**

`src/lib/supabase/admin.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

// 서버 액션에서만 사용할 것
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

**Step 4: 미들웨어 (세션 유지)**

`src/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // 로그인 안 된 상태에서 /login 외 접근 시 리다이렉트
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 로그인 된 상태에서 /login 접근 시 홈으로
  if (user && request.nextUrl.pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

**Step 5: 빌드 확인**

```bash
npm run build
```
Expected: 에러 없이 빌드 성공

---

## Task 4: 타입 정의

**Files:**
- Create: `src/types/index.ts`

**Step 1: 공통 타입 작성**

`src/types/index.ts`:
```typescript
export type Role = 'admin' | 'employee'

export interface Profile {
  id: string
  employee_id: string
  name: string
  department: string
  role: Role
}

export interface Course {
  id: string
  title: string
  created_at: string
  course_sessions?: CourseSession[]
}

export interface CourseSession {
  id: string
  course_id: string
  session_number: number
  location: string
  course_date: string
  enrollment_start: string
  enrollment_end: string
  max_participants: number
  created_at: string
  enrollment_count?: number   // 집계용
  is_enrolled?: boolean       // 현재 유저 신청 여부
}

export interface Enrollment {
  id: string
  session_id: string
  user_id: string
  created_at: string
  profile?: Profile
  course_session?: CourseSession
}
```

---

## Task 5: 로그인 페이지

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/actions.ts`

**Step 1: 서버 액션**

`src/app/login/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const supabase = await createClient()
  const employeeId = formData.get('employee_id') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({
    email: `${employeeId}@yura.internal`,
    password,
  })

  if (error) {
    return { error: '사번 또는 비밀번호가 올바르지 않습니다.' }
  }

  redirect('/')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

**Step 2: 로그인 페이지 UI**

`src/app/login/page.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { login } from './actions'

export default function LoginPage() {
  const [error, setError] = useState('')

  async function handleSubmit(formData: FormData) {
    const result = await login(formData)
    if (result?.error) setError(result.error)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2 text-gray-800">YURA AI School</h1>
        <p className="text-center text-gray-500 text-sm mb-6">사내 교육 수강신청 시스템</p>
        <form action={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">사번</label>
            <input
              name="employee_id"
              type="text"
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="사번을 입력하세요"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
            <input
              name="password"
              type="password"
              required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="비밀번호를 입력하세요"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 3: 브라우저에서 확인**

`npm run dev` 후 `http://localhost:3000/login` 접속 → 로그인 폼 표시 확인
관리자 계정(admin / yura-admin-2026)으로 로그인 → `/`로 리다이렉트 확인

---

## Task 6: 공통 레이아웃 및 네비게이션

**Files:**
- Create: `src/app/layout.tsx` (수정)
- Create: `src/components/Navbar.tsx`
- Create: `src/lib/auth.ts`

**Step 1: 현재 유저 프로필 조회 헬퍼**

`src/lib/auth.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { Profile } from '@/types'

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return data
}
```

**Step 2: Navbar 컴포넌트**

`src/components/Navbar.tsx`:
```tsx
import Link from 'next/link'
import { Profile } from '@/types'
import { logout } from '@/app/login/actions'

export default function Navbar({ profile }: { profile: Profile }) {
  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-bold text-blue-600 text-lg">YURA AI School</Link>
        {profile.role === 'admin' && (
          <>
            <Link href="/admin/courses" className="text-sm text-gray-600 hover:text-gray-900">강좌 관리</Link>
            <Link href="/admin/employees" className="text-sm text-gray-600 hover:text-gray-900">직원 관리</Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{profile.name} ({profile.department})</span>
        <form action={logout}>
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-700">로그아웃</button>
        </form>
      </div>
    </nav>
  )
}
```

**Step 3: 루트 레이아웃 수정**

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'YURA AI School',
  description: '사내 교육 수강신청 시스템',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-gray-50 min-h-screen`}>{children}</body>
    </html>
  )
}
```

---

## Task 7: 관리자 — 직원 관리

**Files:**
- Create: `src/app/admin/employees/page.tsx`
- Create: `src/app/admin/employees/actions.ts`

**Step 1: 직원 등록 서버 액션**

`src/app/admin/employees/actions.ts`:
```typescript
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createEmployee(formData: FormData) {
  const employeeId = formData.get('employee_id') as string
  const name = formData.get('name') as string
  const department = formData.get('department') as string

  // 권한 확인
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '인증이 필요합니다.' }

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: '권한이 없습니다.' }

  const adminClient = createAdminClient()

  // Supabase Auth 계정 생성
  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email: `${employeeId}@yura.internal`,
    password: `y${employeeId}`,
    email_confirm: true,
  })

  if (authError) return { error: `계정 생성 실패: ${authError.message}` }

  // profiles 테이블에 등록
  const { error: profileError } = await adminClient
    .from('profiles')
    .insert({ id: authUser.user.id, employee_id: employeeId, name, department, role: 'employee' })

  if (profileError) {
    await adminClient.auth.admin.deleteUser(authUser.user.id)
    return { error: `프로필 등록 실패: ${profileError.message}` }
  }

  revalidatePath('/admin/employees')
  return { success: true }
}
```

**Step 2: 직원 관리 페이지**

`src/app/admin/employees/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import EmployeeForm from './EmployeeForm'

export default async function EmployeesPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/')

  const supabase = await createClient()
  const { data: employees } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'employee')
    .order('employee_id')

  return (
    <div>
      <Navbar profile={profile} />
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold text-gray-800 mb-6">직원 관리</h1>
        <EmployeeForm />
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3 text-gray-700">등록된 직원 ({employees?.length ?? 0}명)</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">사번</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">이름</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">부서</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees?.map(emp => (
                  <tr key={emp.id}>
                    <td className="px-4 py-3 text-gray-700">{emp.employee_id}</td>
                    <td className="px-4 py-3 text-gray-700">{emp.name}</td>
                    <td className="px-4 py-3 text-gray-700">{emp.department}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
```

**Step 3: EmployeeForm 클라이언트 컴포넌트**

`src/app/admin/employees/EmployeeForm.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { createEmployee } from './actions'

export default function EmployeeForm() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(formData: FormData) {
    const result = await createEmployee(formData)
    if (result?.error) {
      setMessage({ type: 'error', text: result.error })
    } else {
      setMessage({ type: 'success', text: '직원이 등록되었습니다.' })
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold mb-4 text-gray-700">직원 등록</h2>
      <form action={handleSubmit} className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">사번</label>
          <input name="employee_id" required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="20240001" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input name="name" required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="홍길동" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">부서</label>
          <input name="department" required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="개발팀" />
        </div>
        <div className="col-span-3 flex items-center gap-4">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            등록
          </button>
          {message && (
            <p className={`text-sm ${message.type === 'error' ? 'text-red-500' : 'text-green-600'}`}>
              {message.text}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}
```

**Step 4: 브라우저 확인**

`http://localhost:3000/admin/employees` 접속 → 직원 등록 폼 표시
테스트 직원 등록 (사번: 20240001, 이름: 테스트직원, 부서: 개발팀)
Supabase 대시보드 Authentication > Users에서 계정 생성 확인

---

## Task 8: 관리자 — 강좌 관리

**Files:**
- Create: `src/app/admin/courses/page.tsx`
- Create: `src/app/admin/courses/actions.ts`
- Create: `src/app/admin/courses/CourseForm.tsx`
- Create: `src/app/admin/courses/[id]/edit/page.tsx`

**Step 1: 강좌 서버 액션**

`src/app/admin/courses/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function requireAdmin() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') throw new Error('권한 없음')
  return profile
}

export async function createCourse(formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const title = formData.get('title') as string
  const sessions = JSON.parse(formData.get('sessions') as string)

  const { data: course, error } = await supabase
    .from('courses').insert({ title }).select().single()
  if (error) return { error: error.message }

  const sessionRows = sessions.map((s: any, i: number) => ({
    course_id: course.id,
    session_number: i + 1,
    location: s.location,
    course_date: s.course_date,
    enrollment_start: s.enrollment_start,
    enrollment_end: s.enrollment_end,
    max_participants: parseInt(s.max_participants),
  }))

  const { error: sessionError } = await supabase
    .from('course_sessions').insert(sessionRows)
  if (sessionError) return { error: sessionError.message }

  revalidatePath('/admin/courses')
  redirect('/admin/courses')
}

export async function updateCourse(courseId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  const title = formData.get('title') as string
  await supabase.from('courses').update({ title }).eq('id', courseId)

  revalidatePath('/admin/courses')
  redirect('/admin/courses')
}

export async function updateSession(sessionId: string, formData: FormData) {
  await requireAdmin()
  const supabase = await createClient()

  await supabase.from('course_sessions').update({
    location: formData.get('location'),
    course_date: formData.get('course_date'),
    enrollment_start: formData.get('enrollment_start'),
    enrollment_end: formData.get('enrollment_end'),
    max_participants: parseInt(formData.get('max_participants') as string),
  }).eq('id', sessionId)

  revalidatePath('/admin/courses')
  redirect('/admin/courses')
}
```

**Step 2: 강좌 목록 페이지**

`src/app/admin/courses/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

export default async function AdminCoursesPage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/')

  const supabase = await createClient()
  const { data: courses } = await supabase
    .from('courses')
    .select(`
      *,
      course_sessions (
        *,
        enrollments (count)
      )
    `)
    .order('created_at', { ascending: false })

  return (
    <div>
      <Navbar profile={profile} />
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-gray-800">강좌 관리</h1>
          <Link href="/admin/courses/new" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
            + 강좌 개설
          </Link>
        </div>
        <div className="space-y-4">
          {courses?.map(course => (
            <div key={course.id} className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex justify-between items-start mb-3">
                <h2 className="font-semibold text-gray-800">{course.title}</h2>
                <Link href={`/admin/courses/${course.id}/edit`} className="text-sm text-blue-600 hover:underline">수정</Link>
              </div>
              <div className="space-y-2">
                {course.course_sessions?.map((session: any) => {
                  const count = session.enrollments?.[0]?.count ?? 0
                  return (
                    <div key={session.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
                      <span className="text-gray-700">
                        {session.session_number}회차 · {session.course_date} · {session.location}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className={`font-medium ${count >= session.max_participants ? 'text-red-500' : 'text-green-600'}`}>
                          {count}/{session.max_participants}명
                        </span>
                        <Link href={`/admin/courses/${course.id}/sessions/${session.id}`} className="text-blue-600 hover:underline">
                          수강현황
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
```

**Step 3: 강좌 개설 폼 (클라이언트)**

`src/app/admin/courses/CourseForm.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { createCourse } from './actions'
import { useRouter } from 'next/navigation'

interface SessionInput {
  location: string
  course_date: string
  enrollment_start: string
  enrollment_end: string
  max_participants: string
}

export default function CourseForm() {
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionInput[]>([
    { location: '', course_date: '', enrollment_start: '', enrollment_end: '', max_participants: '' }
  ])

  function addSession() {
    setSessions([...sessions, { location: '', course_date: '', enrollment_start: '', enrollment_end: '', max_participants: '' }])
  }

  function removeSession(index: number) {
    setSessions(sessions.filter((_, i) => i !== index))
  }

  function updateSession(index: number, field: keyof SessionInput, value: string) {
    const updated = [...sessions]
    updated[index][field] = value
    setSessions(updated)
  }

  async function handleSubmit(formData: FormData) {
    formData.set('sessions', JSON.stringify(sessions))
    await createCourse(formData)
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">강좌명</label>
        <input name="title" required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="AI 기초" />
      </div>

      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium text-gray-700">회차 설정</h3>
          <button type="button" onClick={addSession} className="text-sm text-blue-600 hover:underline">+ 회차 추가</button>
        </div>
        <div className="space-y-4">
          {sessions.map((session, i) => (
            <div key={i} className="border border-gray-200 rounded p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-medium text-gray-600">{i + 1}회차</span>
                {sessions.length > 1 && (
                  <button type="button" onClick={() => removeSession(i)} className="text-sm text-red-500">삭제</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">장소</label>
                  <input value={session.location} onChange={e => updateSession(i, 'location', e.target.value)} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">교육 날짜</label>
                  <input type="date" value={session.course_date} onChange={e => updateSession(i, 'course_date', e.target.value)} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">신청 시작일</label>
                  <input type="date" value={session.enrollment_start} onChange={e => updateSession(i, 'enrollment_start', e.target.value)} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">신청 마감일</label>
                  <input type="date" value={session.enrollment_end} onChange={e => updateSession(i, 'enrollment_end', e.target.value)} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">최대 인원</label>
                  <input type="number" min="1" value={session.max_participants} onChange={e => updateSession(i, 'max_participants', e.target.value)} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded text-sm hover:bg-blue-700">강좌 개설</button>
        <button type="button" onClick={() => router.back()} className="border border-gray-300 text-gray-600 px-6 py-2 rounded text-sm hover:bg-gray-50">취소</button>
      </div>
    </form>
  )
}
```

**Step 4: 강좌 개설 페이지**

`src/app/admin/courses/new/page.tsx`:
```tsx
import { getCurrentProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import CourseForm from '../CourseForm'

export default async function NewCoursePage() {
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/')

  return (
    <div>
      <Navbar profile={profile} />
      <main className="max-w-3xl mx-auto p-6">
        <h1 className="text-xl font-bold text-gray-800 mb-6">강좌 개설</h1>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <CourseForm />
        </div>
      </main>
    </div>
  )
}
```

---

## Task 9: 관리자 — 수강신청 현황 및 엑셀 다운로드

**Files:**
- Create: `src/app/admin/courses/[id]/sessions/[sessionId]/page.tsx`
- Create: `src/app/admin/courses/[id]/sessions/[sessionId]/route.ts` (엑셀 다운로드 API)

**Step 1: 수강현황 페이지**

`src/app/admin/courses/[id]/sessions/[sessionId]/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

export default async function SessionEnrollmentsPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>
}) {
  const { id, sessionId } = await params
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/')

  const supabase = await createClient()

  const { data: session } = await supabase
    .from('course_sessions')
    .select('*, courses(title)')
    .eq('id', sessionId)
    .single()

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('*, profiles(employee_id, name, department)')
    .eq('session_id', sessionId)
    .order('created_at')

  const count = enrollments?.length ?? 0

  return (
    <div>
      <Navbar profile={profile} />
      <main className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <Link href="/admin/courses" className="text-sm text-blue-600 hover:underline">← 강좌 목록</Link>
          <h1 className="text-xl font-bold text-gray-800 mt-2">
            {(session as any)?.courses?.title} — {session?.session_number}회차 수강현황
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {session?.course_date} · {session?.location} · {count}/{session?.max_participants}명
          </p>
        </div>

        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold text-gray-700">신청자 목록</h2>
          <a
            href={`/admin/courses/${id}/sessions/${sessionId}/download`}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
          >
            엑셀 다운로드
          </a>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">No.</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">사번</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">이름</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">부서</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">신청일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {enrollments?.map((e, i) => (
                <tr key={e.id}>
                  <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-3 text-gray-700">{(e.profiles as any)?.employee_id}</td>
                  <td className="px-4 py-3 text-gray-700">{(e.profiles as any)?.name}</td>
                  <td className="px-4 py-3 text-gray-700">{(e.profiles as any)?.department}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(e.created_at).toLocaleDateString('ko-KR')}</td>
                </tr>
              ))}
              {count === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">신청자가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
```

**Step 2: 엑셀 다운로드 Route Handler**

`src/app/admin/courses/[id]/sessions/[sessionId]/download/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { sessionId } = await params
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 })
  }

  const supabase = await createClient()

  const { data: session } = await supabase
    .from('course_sessions')
    .select('*, courses(title)')
    .eq('id', sessionId)
    .single()

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('*, profiles(employee_id, name, department)')
    .eq('session_id', sessionId)
    .order('created_at')

  const rows = enrollments?.map((e, i) => ({
    'No.': i + 1,
    '사번': (e.profiles as any)?.employee_id ?? '',
    '이름': (e.profiles as any)?.name ?? '',
    '부서': (e.profiles as any)?.department ?? '',
    '신청일': new Date(e.created_at).toLocaleDateString('ko-KR'),
  })) ?? []

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  const sheetName = `${(session as any)?.courses?.title}_${session?.session_number}회차`
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = encodeURIComponent(`${sheetName}_수강신청현황.xlsx`)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  })
}
```

---

## Task 10: 직원 — 강좌 목록 및 수강신청/변경/취소

**Files:**
- Create: `src/app/page.tsx`
- Create: `src/app/actions.ts`

**Step 1: 수강신청 서버 액션**

`src/app/actions.ts`:
```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function enrollSession(sessionId: string) {
  const supabase = await createClient()
  const profile = await getCurrentProfile()
  if (!profile) return { error: '인증이 필요합니다.' }

  // 정원 확인
  const { count } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)

  const { data: session } = await supabase
    .from('course_sessions')
    .select('max_participants, enrollment_start, enrollment_end')
    .eq('id', sessionId)
    .single()

  if (!session) return { error: '강좌를 찾을 수 없습니다.' }

  const today = new Date().toISOString().split('T')[0]
  if (today < session.enrollment_start || today > session.enrollment_end) {
    return { error: '수강신청 기간이 아닙니다.' }
  }
  if ((count ?? 0) >= session.max_participants) {
    return { error: '정원이 마감되었습니다.' }
  }

  const { error } = await supabase
    .from('enrollments')
    .insert({ session_id: sessionId, user_id: profile.id })

  if (error) return { error: '수강신청에 실패했습니다.' }
  revalidatePath('/')
  return { success: true }
}

export async function cancelEnrollment(enrollmentId: string) {
  const supabase = await createClient()
  const profile = await getCurrentProfile()
  if (!profile) return { error: '인증이 필요합니다.' }

  const { error } = await supabase
    .from('enrollments')
    .delete()
    .eq('id', enrollmentId)
    .eq('user_id', profile.id)

  if (error) return { error: '취소에 실패했습니다.' }
  revalidatePath('/')
  return { success: true }
}

export async function changeEnrollment(oldEnrollmentId: string, newSessionId: string) {
  const supabase = await createClient()
  const profile = await getCurrentProfile()
  if (!profile) return { error: '인증이 필요합니다.' }

  // 새 회차 정원 확인
  const { count } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', newSessionId)

  const { data: session } = await supabase
    .from('course_sessions')
    .select('max_participants, enrollment_start, enrollment_end')
    .eq('id', newSessionId)
    .single()

  if (!session) return { error: '회차를 찾을 수 없습니다.' }

  const today = new Date().toISOString().split('T')[0]
  if (today < session.enrollment_start || today > session.enrollment_end) {
    return { error: '해당 회차는 신청 기간이 아닙니다.' }
  }
  if ((count ?? 0) >= session.max_participants) {
    return { error: '해당 회차는 정원이 마감되었습니다.' }
  }

  // 기존 취소 후 신규 등록 (순차 처리)
  await supabase.from('enrollments').delete().eq('id', oldEnrollmentId).eq('user_id', profile.id)
  const { error } = await supabase
    .from('enrollments')
    .insert({ session_id: newSessionId, user_id: profile.id })

  if (error) return { error: '변경에 실패했습니다.' }
  revalidatePath('/')
  return { success: true }
}
```

**Step 2: 직원 홈 — 강좌 목록**

`src/app/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import CourseCard from '@/components/CourseCard'

export default async function HomePage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role === 'admin') redirect('/admin/courses')

  const supabase = await createClient()

  const { data: courses } = await supabase
    .from('courses')
    .select(`
      *,
      course_sessions (
        *,
        enrollments!inner (count)
      )
    `)
    .order('created_at', { ascending: false })

  // 현재 유저의 수강신청 목록
  const { data: myEnrollments } = await supabase
    .from('enrollments')
    .select('id, session_id')
    .eq('user_id', profile.id)

  const myEnrollmentMap = new Map(myEnrollments?.map(e => [e.session_id, e.id]))

  return (
    <div>
      <Navbar profile={profile} />
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold text-gray-800 mb-6">수강 가능한 강좌</h1>
        {courses?.length === 0 && (
          <p className="text-gray-400 text-center py-16">개설된 강좌가 없습니다.</p>
        )}
        <div className="space-y-4">
          {courses?.map(course => (
            <CourseCard
              key={course.id}
              course={course}
              myEnrollmentMap={myEnrollmentMap}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
```

**Step 3: CourseCard 컴포넌트**

`src/components/CourseCard.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { enrollSession, cancelEnrollment, changeEnrollment } from '@/app/actions'

export default function CourseCard({
  course,
  myEnrollmentMap,
}: {
  course: any
  myEnrollmentMap: Map<string, string>
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  // 이 강좌에서 내가 신청한 회차 찾기
  const mySession = course.course_sessions?.find((s: any) => myEnrollmentMap.has(s.id))
  const myEnrollmentId = mySession ? myEnrollmentMap.get(mySession.id) : null

  async function handleEnroll(sessionId: string) {
    setLoading(sessionId)
    const result = await enrollSession(sessionId)
    setMessage(result.error ?? '수강신청이 완료되었습니다.')
    setLoading(null)
  }

  async function handleCancel() {
    if (!myEnrollmentId) return
    setLoading('cancel')
    const result = await cancelEnrollment(myEnrollmentId)
    setMessage(result.error ?? '수강신청이 취소되었습니다.')
    setLoading(null)
  }

  async function handleChange(newSessionId: string) {
    if (!myEnrollmentId) return
    setLoading(newSessionId)
    const result = await changeEnrollment(myEnrollmentId, newSessionId)
    setMessage(result.error ?? '수강 변경이 완료되었습니다.')
    setLoading(null)
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-800 mb-3">{course.title}</h2>
      {message && (
        <p className="text-sm text-blue-600 mb-3 bg-blue-50 px-3 py-2 rounded">{message}</p>
      )}
      <div className="space-y-2">
        {course.course_sessions?.map((session: any) => {
          const count = session.enrollments?.[0]?.count ?? 0
          const isFull = count >= session.max_participants
          const inPeriod = today >= session.enrollment_start && today <= session.enrollment_end
          const isMySession = myEnrollmentMap.has(session.id)
          const canEnroll = !isFull && inPeriod && !mySession
          const canChange = !isFull && inPeriod && mySession && !isMySession

          return (
            <div key={session.id} className="flex items-center justify-between bg-gray-50 rounded px-4 py-3">
              <div className="text-sm">
                <span className="font-medium text-gray-700">{session.session_number}회차</span>
                <span className="text-gray-500 ml-2">{session.course_date} · {session.location}</span>
                <span className="text-gray-400 ml-2 text-xs">신청: {session.enrollment_start} ~ {session.enrollment_end}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${isFull ? 'text-red-500' : 'text-green-600'}`}>
                  {count}/{session.max_participants}명
                </span>
                {isMySession && (
                  <>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">신청완료</span>
                    <button
                      onClick={handleCancel}
                      disabled={loading === 'cancel'}
                      className="text-xs border border-gray-300 text-gray-600 px-3 py-1 rounded hover:bg-gray-100 disabled:opacity-50"
                    >
                      취소
                    </button>
                  </>
                )}
                {canEnroll && (
                  <button
                    onClick={() => handleEnroll(session.id)}
                    disabled={loading === session.id}
                    className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    수강신청
                  </button>
                )}
                {canChange && (
                  <button
                    onClick={() => handleChange(session.id)}
                    disabled={loading === session.id}
                    className="text-xs border border-blue-600 text-blue-600 px-3 py-1 rounded hover:bg-blue-50 disabled:opacity-50"
                  >
                    수강변경
                  </button>
                )}
                {isFull && !isMySession && (
                  <span className="text-xs text-red-500">마감</span>
                )}
                {!inPeriod && !isMySession && !isFull && (
                  <span className="text-xs text-gray-400">신청기간 아님</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

## Task 11: 강좌 수정 페이지

**Files:**
- Create: `src/app/admin/courses/[id]/edit/page.tsx`

`src/app/admin/courses/[id]/edit/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { updateSession } from '../../../actions'
import Link from 'next/link'

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getCurrentProfile()
  if (!profile || profile.role !== 'admin') redirect('/')

  const supabase = await createClient()
  const { data: course } = await supabase
    .from('courses')
    .select('*, course_sessions(*)')
    .eq('id', id)
    .single()

  if (!course) redirect('/admin/courses')

  return (
    <div>
      <Navbar profile={profile} />
      <main className="max-w-3xl mx-auto p-6">
        <Link href="/admin/courses" className="text-sm text-blue-600 hover:underline">← 강좌 목록</Link>
        <h1 className="text-xl font-bold text-gray-800 mt-2 mb-6">{course.title} 수정</h1>
        <div className="space-y-4">
          {course.course_sessions?.map((session: any) => (
            <div key={session.id} className="bg-white rounded-lg border border-gray-200 p-5">
              <h3 className="font-medium text-gray-700 mb-3">{session.session_number}회차</h3>
              <form action={async (formData: FormData) => {
                'use server'
                await updateSession(session.id, formData)
              }} className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">장소</label>
                  <input name="location" defaultValue={session.location} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">교육 날짜</label>
                  <input type="date" name="course_date" defaultValue={session.course_date} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">신청 시작일</label>
                  <input type="date" name="enrollment_start" defaultValue={session.enrollment_start} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">신청 마감일</label>
                  <input type="date" name="enrollment_end" defaultValue={session.enrollment_end} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">최대 인원</label>
                  <input type="number" name="max_participants" defaultValue={session.max_participants} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </div>
                <div className="flex items-end">
                  <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">저장</button>
                </div>
              </form>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
```

---

## Task 12: Vercel 배포

**Step 1: vercel.json 생성**

```json
{
  "framework": "nextjs"
}
```

**Step 2: Vercel에서 프로젝트 연결**

```bash
npx vercel --prod
```
또는 Vercel 대시보드에서 GitHub 저장소 연결.

**Step 3: 환경변수 설정**

Vercel 대시보드 → Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Step 4: 빌드 및 배포 확인**

```bash
npm run build
```
Expected: 에러 없이 빌드 성공, Vercel 배포 URL에서 동작 확인

---

## 최종 점검 체크리스트

- [ ] 관리자 로그인 → `/admin/courses` 이동
- [ ] 강좌 개설 (회차 2개) → 목록에 표시
- [ ] 직원 등록 → Supabase Auth에 계정 생성 확인
- [ ] 직원 계정으로 로그인 → `/` 이동
- [ ] 수강신청 → 신청완료 뱃지 + 취소 버튼 표시
- [ ] 수강변경 → 다른 회차로 변경 완료
- [ ] 관리자에서 수강현황 → 신청자 목록 표시
- [ ] 엑셀 다운로드 → 이름/부서/사번 포함 xlsx 파일
