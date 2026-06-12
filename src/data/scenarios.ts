// ─── Scenario engine data ────────────────────────────────────────────────────
// FX commands are dispatched as window CustomEvent('netwar-fx', { detail: Fx })
// and handled by NetworkGraph. Game events (weight-change / link-break) come
// back as CustomEvent('netwar-ev', { detail: { type } }).

export type Fx =
  | { type: 'bounce'; node: string }
  | { type: 'packet'; route: string[]; kind: 'http' | 'blocked' | 'tunnel' | 'dns' }
  | { type: 'highlight'; nodes: string[] }
  | { type: 'clear' }
  | { type: 'ospf-on' }
  | { type: 'ospf-off' }

export interface ScenQuiz {
  q: string
  options: string[]
  correct: number       // index
  explain: string
}

export interface ScenStep {
  text: string
  fx?: Fx[]
  diagram?: string       // preformatted ASCII block
  quiz?: ScenQuiz
  action?: { label: string; fx: Fx[] }          // optional interactive button
  waitFor?: 'weight-change' | 'link-break'      // wait for a game event
  waitHint?: string
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface Scen {
  id: number
  title: string
  summary: string
  difficulty: Difficulty
  time: string
  teaches: string[]
  reward: number
  steps: ScenStep[]      // empty → locked stub
}

// ─── Scenario 01: Первый запрос (DNS) ────────────────────────────────────────

const SC01: ScenStep[] = [
  {
    text: 'Пользователь вводит google.com в браузер. Браузер не знает IP этого домена. Сначала нужно спросить DNS.',
    fx: [{ type: 'highlight', nodes: ['u2'] }, { type: 'bounce', node: 'u2' }],
  },
  {
    text: 'DNS-Stub резолвер — это первая точка. Он живёт прямо на твоём компьютере. Проверяет локальный кэш — нет ли ответа.',
    fx: [{ type: 'highlight', nodes: ['u2', 'dnsstub1'] },
         { type: 'packet', route: ['u2', 'dnsstub1'], kind: 'dns' }],
  },
  {
    text: 'Кэша нет. Stub спрашивает рекурсивный резолвер провайдера. Порт 53 UDP — быстрый и без подтверждения доставки.',
    fx: [{ type: 'highlight', nodes: ['dnsstub1', 'dnsr1'] },
         { type: 'packet', route: ['dnsstub1', 'dnsr1'], kind: 'dns' }],
  },
  {
    text: 'Рекурсор не знает google.com. Спрашивает ROOT сервер. Их 13 штук в мире. ROOT не знает IP, но знает кто отвечает за .com',
    fx: [{ type: 'highlight', nodes: ['dnsr1', 'dnsroot1'] },
         { type: 'packet', route: ['dnsr1', 'dnsroot1'], kind: 'dns' }],
  },
  {
    text: "ROOT говорит: 'Спроси .com TLD сервер.' TLD знает все домены второго уровня в .com. Он скажет кто отвечает за google.com",
    fx: [{ type: 'highlight', nodes: ['dnsroot1', 'dnstld1'] },
         { type: 'packet', route: ['dnsroot1', 'dnstld1'], kind: 'dns' }],
  },
  {
    text: "TLD говорит: 'ns1.google.com знает ответ.' NS1 — это авторитетный сервер Google. Он хранит A-запись: google.com = 142.250.x.x",
    fx: [{ type: 'highlight', nodes: ['dnstld1', 'dnsauth1'] },
         { type: 'packet', route: ['dnstld1', 'dnsauth1'], kind: 'dns' }],
  },
  {
    text: 'Ответ летит обратно по цепочке. Каждый сервер кэширует результат на TTL секунд. Следующий запрос будет быстрее!',
    fx: [{ type: 'highlight', nodes: ['dnsauth1', 'dnstld1', 'dnsroot1', 'dnsr1', 'dnsstub1', 'u2'] },
         { type: 'packet', route: ['dnsauth1', 'dnstld1', 'dnsroot1', 'dnsr1', 'dnsstub1', 'u2'], kind: 'dns' }],
  },
  {
    text: 'DNS резолюция завершена! Весь процесс занял ~80-150мс. Теперь браузер знает IP и может установить TCP.',
    fx: [{ type: 'highlight', nodes: ['u2', 'dnsstub1', 'dnsr1', 'dnsroot1', 'dnstld1', 'dnsauth1'] }],
    quiz: {
      q: 'Какой протокол использует DNS по умолчанию?',
      options: ['TCP', 'UDP', 'ICMP'],
      correct: 1,
      explain: 'UDP — без установки соединения, поэтому DNS-запрос укладывается в один пакет туда и один обратно. TCP используется только для больших ответов.',
    },
  },
]

// ─── Scenario 02: ТСПУ блокирует ─────────────────────────────────────────────

const SC02: ScenStep[] = [
  {
    text: 'Пользователь хочет зайти на blocked.com. Давай посмотрим что происходит на маршруте.',
    fx: [{ type: 'highlight', nodes: ['u1', 'ws3'] }, { type: 'bounce', node: 'u1' }],
  },
  {
    text: 'ТСПУ — это Deep Packet Inspection. Стоит внутри сети провайдера. Читает заголовки каждого пакета.',
    fx: [{ type: 'highlight', nodes: ['u1', 'sw1', 'isp1', 'tspu1'] },
         { type: 'packet', route: ['u1', 'sw1', 'isp1'], kind: 'http' }],
  },
  {
    text: 'SNI (Server Name Indication) — имя сайта передаётся ОТКРЫТЫМ текстом в начале TLS соединения. ТСПУ его видит!',
    fx: [{ type: 'highlight', nodes: ['tspu1'] }],
    diagram:
`┌─ Ethernet L2: MAC адреса ──────┐
│ ┌─ IP L3: 192.168.1.1 → x.x ─┐ │
│ │ ┌─ TCP L4: порт 443 ─────┐ │ │
│ │ │ TLS ClientHello        │ │ │
│ │ │ SNI: blocked.com ←ТСПУ │ │ │
│ │ └────────────────────────┘ │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘`,
  },
  {
    text: 'blocked.com в чёрном списке. ТСПУ отправляет TCP RST пакет. Соединение сброшено. Сайт недоступен.',
    fx: [{ type: 'highlight', nodes: ['u1', 'sw1', 'isp1', 'tspu1'] },
         { type: 'packet', route: ['u1', 'sw1', 'isp1', 'tspu1'], kind: 'blocked' }],
  },
  {
    text: 'Проверь себя:',
    quiz: {
      q: 'Что именно ТСПУ видит в зашифрованном HTTPS?',
      options: ['содержимое страницы', 'SNI — имя сервера', 'логин и пароль'],
      correct: 1,
      explain: 'Контент HTTPS зашифрован, но SNI в TLS ClientHello передаётся открыто — до установления шифрования. Именно по нему ТСПУ блокирует домены.',
    },
  },
]

// ─── Scenario 03: Поднять VPN ────────────────────────────────────────────────

const SC03: ScenStep[] = [
  {
    text: 'ТСПУ заблокировал blocked.com. Но есть способ обойти — VPN туннель. Смотри как это работает.',
    fx: [{ type: 'highlight', nodes: ['tspu1', 'ws3'] }],
  },
  {
    text: 'VPN сервер стоит за пределами ТСПУ. Идея: зашифровать весь пакет и отправить его как будто мы идём на VPN сервер.',
    fx: [{ type: 'highlight', nodes: ['vpn1'] }, { type: 'bounce', node: 'vpn1' }],
  },
  {
    text: 'Матрёшка из конвертов! Снаружи: адрес VPN сервера (не заблокирован). Внутри: зашифрованный оригинальный пакет.',
    diagram:
`ИСХОДНЫЙ ПАКЕТ:
┌──────────────────────────────┐
│ IP dst: blocked.com          │
│ SNI: blocked.com             │
│ данные...                    │
└──────────────────────────────┘

ПОСЛЕ ШИФРОВАНИЯ VPN:
┌──────────────────────────────┐
│ IP dst: vpn-server.nl  ←ТСПУ │
│ зашифровано: ░░░░░░░░░░░░░░  │
│  ┌────────────────────────┐  │
│  │ IP dst: blocked.com    │  │
│  │ SNI: blocked.com       │  │
│  │ данные...              │  │
│  └────────────────────────┘  │
└──────────────────────────────┘`,
  },
  {
    text: 'ТСПУ видит только: IP VPN сервера. SNI заблокированного сайта скрыт. Пакет проходит!',
    fx: [{ type: 'highlight', nodes: ['u1', 'sw1', 'isp1', 'tspu1', 'vpn1'] },
         { type: 'packet', route: ['u1', 'sw1', 'isp1', 'tspu1', 'vpn1'], kind: 'tunnel' }],
  },
  {
    text: 'VPN сервер расшифровывает пакет. Отправляет запрос к blocked.com от своего IP. Сайт отвечает. Ответ идёт обратно тем же путём.',
    fx: [{ type: 'highlight', nodes: ['vpn1', 'fw1', 'ws3'] },
         { type: 'packet', route: ['vpn1', 'fw1', 'ws3'], kind: 'tunnel' }],
  },
  {
    text: 'Проверь себя:',
    quiz: {
      q: 'Сколько TCP соединений создаёт VPN?',
      options: ['одно, напрямую к сайту', 'два — ты→VPN и VPN→сайт', 'три'],
      correct: 1,
      explain: 'Два плеча: зашифрованное соединение ты→VPN-сервер, и обычное VPN-сервер→сайт. Сайт видит IP VPN-сервера, а не твой.',
    },
  },
]

// ─── Scenario 04: TCP рукопожатие ────────────────────────────────────────────

const SC04: ScenStep[] = [
  {
    text: 'DNS ответил — мы знаем IP google.com. Теперь нужно установить TCP соединение. TCP гарантирует доставку через рукопожатие.',
    fx: [{ type: 'highlight', nodes: ['u2', 'ws2'] }],
  },
  {
    text: "SYN — 'Хочу соединиться'. Клиент отправляет пакет с флагом SYN. Случайный начальный номер seq=1000.",
    fx: [{ type: 'highlight', nodes: ['u2', 'sw1', 'isp1', 'tspu1', 'fw1', 'ws2'] },
         { type: 'packet', route: ['u2', 'sw1', 'isp1', 'tspu1', 'fw1', 'ws2'], kind: 'http' }],
  },
  {
    text: "SYN-ACK — 'Окей, принято, я готов'. Сервер подтверждает: ACK=1001, свой seq=5000. Теперь клиент должен подтвердить.",
    fx: [{ type: 'packet', route: ['ws2', 'fw1', 'tspu1', 'isp1', 'sw1', 'u2'], kind: 'http' }],
  },
  {
    text: "ACK — 'Подтверждаю!' Рукопожатие завершено. 3 пакета, ~1.5 RTT. Соединение установлено — можно слать данные.",
    fx: [{ type: 'packet', route: ['u2', 'sw1', 'isp1', 'tspu1', 'fw1', 'ws2'], kind: 'http' }],
  },
  {
    text: 'Сравни с UDP — там никакого рукопожатия. UDP просто кидает данные и не проверяет дошли ли. Быстрее, но без гарантий.',
    action: {
      label: '⟳ Симулировать потерю пакета',
      fx: [{ type: 'packet', route: ['u2', 'sw1', 'isp1'], kind: 'http' },
           { type: 'bounce', node: 'u2' },
           { type: 'packet', route: ['u2', 'sw1', 'isp1', 'tspu1', 'fw1', 'ws2'], kind: 'http' }],
    },
  },
]

// ─── Scenario 05: OSPF находит путь ──────────────────────────────────────────

const SC05: ScenStep[] = [
  {
    text: 'OSPF — протокол динамической маршрутизации. Роутеры обмениваются информацией о топологии и каждый сам считает кратчайший путь.',
    fx: [{ type: 'ospf-on' }],
  },
  {
    text: 'Каждое ребро имеет COST — стоимость. Формула: Cost = 100 000 000 / BW (бит/с). Канал 1Гбит/с → Cost = 100. 10Гбит/с → Cost = 10.',
    fx: [{ type: 'highlight', nodes: ['sw1', 'isp1', 'tspu1', 'fw1'] }],
  },
  {
    text: 'Попробуй изменить вес любого ребра — нажми на цифру на ребре и введи новое значение, затем Enter. Смотри как маршрут перестраивается.',
    fx: [{ type: 'clear' }],
    waitFor: 'weight-change',
    waitHint: 'Жду: клик на цифру веса → ввод → Enter',
  },
  {
    text: 'Теперь симулируем аварию. Зажми любое ребро на 500мс — оно оборвётся, и OSPF пересчитает маршрут в обход за ~300мс. Именно так интернет переживает аварии.',
    waitFor: 'link-break',
    waitHint: 'Жду: long-press (500мс) на любом ребре',
  },
]

// ─── All 15 scenarios ────────────────────────────────────────────────────────

export const SCENS: Scen[] = [
  { id: 1,  title: 'Первый запрос',      summary: 'DNS резолюция от А до Я',
    difficulty: 'easy',   time: '5 мин',  teaches: ['DNS', 'UDP', 'L7'],   reward: 500,  steps: SC01 },
  { id: 2,  title: 'ТСПУ блокирует',     summary: 'Блокировка по SNI — что видит DPI',
    difficulty: 'easy',   time: '5 мин',  teaches: ['DPI', 'SNI', 'TLS'],  reward: 800,  steps: SC02 },
  { id: 3,  title: 'Поднять VPN',        summary: 'Туннель и инкапсуляция — обход блокировки',
    difficulty: 'medium', time: '7 мин',  teaches: ['VPN', 'шифрование'],  reward: 1200, steps: SC03 },
  { id: 4,  title: 'TCP рукопожатие',    summary: 'SYN / SYN-ACK / ACK за 1.5 RTT',
    difficulty: 'easy',   time: '5 мин',  teaches: ['TCP', 'UDP', 'L4'],   reward: 1000, steps: SC04 },
  { id: 5,  title: 'OSPF находит путь',  summary: 'Алгоритм Дейкстры и аварии каналов',
    difficulty: 'medium', time: '8 мин',  teaches: ['OSPF', 'маршрутизация'], reward: 1500, steps: SC05 },
  { id: 6,  title: 'BGP между AS',       summary: 'Настройка BGP пиринга между автономными системами',
    difficulty: 'hard',   time: '15 мин', teaches: ['BGP', 'AS'],          reward: 2000, steps: [] },
  { id: 7,  title: 'DNS отравление',     summary: 'ТСПУ подменяет DNS ответы — как защититься',
    difficulty: 'medium', time: '8 мин',  teaches: ['DNS', 'DoH'],         reward: 1500, steps: [] },
  { id: 8,  title: 'Инкапсуляция L1-L7', summary: 'Матрёшка протоколов от бита до HTTP',
    difficulty: 'easy',   time: '10 мин', teaches: ['OSI', 'L1-L7'],       reward: 1000, steps: [] },
  { id: 9,  title: 'DDoS атака',         summary: 'Перегрузка канала и защита rate limiting',
    difficulty: 'hard',   time: '12 мин', teaches: ['DDoS', 'QoS'],        reward: 2500, steps: [] },
  { id: 10, title: 'CDN кэширование',    summary: 'Cache HIT vs MISS — почему CDN ускоряет сайты',
    difficulty: 'easy',   time: '6 мин',  teaches: ['CDN', 'кэш'],         reward: 1000, steps: [] },
  { id: 11, title: 'TCP vs UDP выбор',   summary: 'Когда нужна надёжность, когда скорость',
    difficulty: 'medium', time: '8 мин',  teaches: ['TCP', 'UDP'],         reward: 1500, steps: [] },
  { id: 12, title: 'Обфускация VLESS',   summary: 'Почему WireGuard блокируют а VLESS нет',
    difficulty: 'hard',   time: '15 мин', teaches: ['VLESS', 'DPI'],       reward: 3000, steps: [] },
  { id: 13, title: 'DNSSEC защита',      summary: 'Криптографическая подпись DNS записей',
    difficulty: 'medium', time: '10 мин', teaches: ['DNSSEC'],             reward: 2000, steps: [] },
  { id: 14, title: 'BGP Hijack атака',   summary: 'Кража маршрутов и как это остановить',
    difficulty: 'hard',   time: '20 мин', teaches: ['BGP', 'безопасность'], reward: 3500, steps: [] },
  { id: 15, title: 'Полный маршрут',     summary: 'DNS + TCP + HTTP + ответ — весь цикл',
    difficulty: 'medium', time: '15 мин', teaches: ['всё вместе'],         reward: 2500, steps: [] },
]

// ─── Progress (localStorage) ─────────────────────────────────────────────────

export interface Progress { completed: number[]; bits: number }
const LS_KEY = 'netwar-progress'

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) { const p = JSON.parse(raw); return { completed: p.completed ?? [], bits: p.bits ?? 0 } }
  } catch { /* corrupted → reset */ }
  return { completed: [], bits: 0 }
}

export function saveProgress(p: Progress) {
  localStorage.setItem(LS_KEY, JSON.stringify(p))
}

export function isUnlocked(id: number, completed: number[]): boolean {
  if (id === 1) return true
  if (id <= 5)  return completed.includes(1)
  if (id <= 10) return [2, 3, 4, 5].every(n => completed.includes(n))
  return [6, 7, 8, 9, 10].every(n => completed.includes(n))
}

// ─── FX bridge helpers ───────────────────────────────────────────────────────

export function sendFx(fx: Fx) {
  window.dispatchEvent(new CustomEvent('netwar-fx', { detail: fx }))
}
