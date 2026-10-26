/**
 * Demo content for the fictional FITCLUB club. Every text exists in Kazakh, Russian and English.
 * Photos are free Unsplash stock images, stored with isDemo=true so the site labels them
 * "Demo photo" — they do not depict a real FITCLUB facility.
 */
import { lt, type LocalizedText } from '@fitclub/shared';

const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1600&q=70`;

export const PHOTOS = {
  hero: U('photo-1605296867304-46d5465a13f1'),
  gymFloor: U('photo-1534438327276-14e5300c3a48'),
  gymBright: U('photo-1540497077202-7c8a3999166f'),
  dumbbells: U('photo-1544033527-b192daee1f5b'),
  dumbbellRow: U('photo-1576678927484-cc907957088c'),
  groupMat: U('photo-1518611012118-696072aa579a'),
  pool: U('photo-1576610616656-d3aa5d1f4534'),
  deadlift: U('photo-1517836357463-d25dfeac3438'),
  deadlift2: U('photo-1517963879433-6ad2b056d712'),
  rowing: U('photo-1519505907962-0a6cb0167c73'),
  core: U('photo-1571019613454-1cb2f99b2d8b'),
  ropes: U('photo-1599058917212-d750089bc07e'),
  barbellGrip: U('photo-1549060279-7e168fcee0c2'),
  bands: U('photo-1584735935682-2f2b69dff9d2'),
  pushups: U('photo-1594737625785-a6cbdabd333c'),
  squat: U('photo-1574680096145-d05b474e2155'),
  curl: U('photo-1581009146145-b5ef050c2e1e'),
  pullup: U('photo-1526506118085-60ce8714f8c5'),
  trainerA: U('photo-1507398941214-572c25f4b1dc'),
  trainerB: U('photo-1530822847156-5df684ec5ee1'),
  trainerC: U('photo-1550345332-09e3ac987658'),
  trainerD: U('photo-1583454110551-21f2fa2afe61'),
  trainerE: U('photo-1595078475328-1ab05d0a6a0e'),
  yogaSilhouette: U('photo-1544367567-0f2fcb009e0b'),
  yogaFloor: U('photo-1599901860904-17e6ed7083a0'),
  yogaPose: U('photo-1575052814086-f385e2e2ad1b'),
  stretch: U('photo-1552196527-bffef41ef674'),
  yogaGroup: U('photo-1683056255281-e52a141924f0'),
  groupHands: U('photo-1608405059861-b21a68ae76a2'),
  interior1: U('photo-1597076537061-a6b58163aa45'),
  interior2: U('photo-1662386392891-688364c5a5d7'),
  interior3: U('photo-1689877020200-403d8542d95d'),
} as const;

export const img = (url: string, alt: LocalizedText) => ({ url, alt, isDemo: true, credit: 'Unsplash (demo image)' });

export const BLOCKS: Record<
  string,
  {
    fields: Record<string, LocalizedText>;
    images?: Record<string, ReturnType<typeof img>>;
    items?: { title: LocalizedText; body: LocalizedText; icon?: string }[];
  }
> = {
  'home.hero': {
    fields: {
      eyebrow: lt('Алматы · Астана', 'Алматы · Астана', 'Almaty · Astana'),
      title: lt('Күшіңді біз бірге құрамыз', 'Сила, которую мы строим вместе', 'Strength, built together'),
      subtitle: lt(
        'Жаңа буындағы фитнес-клуб: кәсіби жаттықтырушылар, топтық сабақтар және сізге бейімделген бағдарламалар.',
        'Фитнес-клуб нового поколения: сильные тренеры, групповые занятия и программы, которые подстраиваются под вас.',
        'A new-generation fitness club: expert coaches, signature group classes and programmes that adapt to you.',
      ),
      primaryCta: lt('Клубқа қосылу', 'Вступить в клуб', 'Join the club'),
      secondaryCta: lt('Абонементтер', 'Абонементы', 'View memberships'),
    },
    images: {
      background: img(
        PHOTOS.hero,
        lt('Қараңғы залда штанга көтеру', 'Становая тяга в тёмном зале', 'Deadlift in a dark gym'),
      ),
    },
  },
  'home.intro': {
    fields: {
      title: lt(
        'Жаттығу — ереже емес, мәдениет',
        'Тренировки — это культура, а не обязанность',
        'Training as a culture, not a chore',
      ),
      body: lt(
        'FITCLUB — үш филиалы бар клуб. Біз нәтижеге жетуді қарапайым етеміз: анық бағдарлама, қолайлы кесте және сізді білетін команда.',
        'FITCLUB — клуб с тремя филиалами. Мы делаем результат понятным: ясная программа, удобное расписание и команда, которая знает вас по имени.',
        'FITCLUB is a three-branch club built around one idea: progress should feel clear. A plan that makes sense, a schedule that fits, and a team that knows you by name.',
      ),
    },
    images: {
      image: img(
        PHOTOS.gymFloor,
        lt('Гантельдер қатары бар зал', 'Зал с рядами гантелей', 'Gym floor with dumbbell racks'),
      ),
    },
    items: [
      {
        title: lt('Кәсіби жаттықтырушылар', 'Сертифицированные тренеры', 'Certified coaches'),
        body: lt(
          'Әр жаттықтырушы тәжірибелі және сертификатталған.',
          'Каждый тренер имеет профильное образование и сертификаты.',
          'Every coach holds recognised certifications.',
        ),
        icon: 'award',
      },
      {
        title: lt('Бір абонемент — үш клуб', 'Один абонемент — три клуба', 'One pass, three clubs'),
        body: lt(
          'Премиум абонементтер барлық филиалдарда жарамды.',
          'Премиальные абонементы действуют во всех филиалах.',
          'Premium memberships work in every branch.',
        ),
        icon: 'map-pin',
      },
      {
        title: lt('Онлайн жазылу', 'Онлайн-запись', 'Book online'),
        body: lt(
          'Сабаққа жеке кабинеттен бірнеше секундта жазылыңыз.',
          'Записывайтесь на занятия в личном кабинете за секунды.',
          'Reserve your spot in seconds from the member portal.',
        ),
        icon: 'calendar-check',
      },
    ],
  },
  'home.benefits': {
    fields: {
      title: lt('Неге FITCLUB', 'Почему FITCLUB', 'Why FITCLUB'),
      subtitle: lt(
        'Нәтижеге жетелейтін ортаны ойластырдық.',
        'Мы продумали среду, в которой результат неизбежен.',
        'An environment designed to make progress inevitable.',
      ),
    },
    items: [
      {
        title: lt('Күш және төзімділік', 'Сила и выносливость', 'Strength & endurance'),
        body: lt(
          'Еркін салмақ аймағы мен заманауи кардио.',
          'Зона свободных весов и современное кардио.',
          'Free-weight zones and modern cardio equipment.',
        ),
        icon: 'dumbbell',
      },
      {
        title: lt('Прогресті бақылау', 'Отслеживание прогресса', 'Progress tracking'),
        body: lt(
          'Жаттығулар журналы және жеке бағдарламалар.',
          'Журнал тренировок и персональные программы.',
          'Workout logs and personal programmes in your portal.',
        ),
        icon: 'trending-up',
      },
      {
        title: lt('Қалпына келу', 'Восстановление', 'Recovery'),
        body: lt(
          'Сауна, бассейн және созылу аймағы.',
          'Сауна, бассейн и зона растяжки.',
          'Sauna, pool and dedicated stretching areas.',
        ),
        icon: 'waves',
      },
      {
        title: lt('Икемді абонементтер', 'Гибкие абонементы', 'Flexible memberships'),
        body: lt(
          'Тоқтату, ұзарту және сабақ пакеттері.',
          'Заморозка, продление и пакеты посещений.',
          'Freeze, renew or choose visit packs.',
        ),
        icon: 'snowflake',
      },
    ],
  },
  'home.cta': {
    fields: {
      title: lt('Бірінші жаттығу — тегін', 'Первая тренировка — бесплатно', 'Your first workout is on us'),
      body: lt(
        'Сынақ сабағына өтінім қалдырыңыз — менеджер сізбен хабарласады.',
        'Оставьте заявку на пробное занятие — менеджер свяжется с вами.',
        'Request a trial visit and a membership advisor will get in touch.',
      ),
    },
    images: { image: img(PHOTOS.ropes, lt('Арқанмен жаттығу', 'Тренировка с канатами', 'Battle-rope training')) },
  },
  about: {
    fields: {
      title: lt('Клуб туралы', 'О клубе', 'About the club'),
      lead: lt(
        'FITCLUB 2019 жылы Алматыда бір залдан басталды. Бүгін — үш филиал және ортақ мақсаты бар команда.',
        'FITCLUB начался в 2019 году с одного зала в Алматы. Сегодня это три филиала и команда с общей целью.',
        'FITCLUB started in 2019 with a single gym in Almaty. Today it is three branches and one team with a shared goal.',
      ),
      body: lt(
        '## Біздің көзқарас\n\nСпорт әркімге қолжетімді, түсінікті және қуанышты болуы керек деп сенеміз.\n\n## Құндылықтар\n\n- Нәтижеге адалдық\n- Әр мүшеге құрмет\n- Қауіпсіздік пен тазалық',
        '## Наш подход\n\nМы верим, что спорт должен быть доступным, понятным и приносить радость.\n\n## Ценности\n\n- Честность к результату\n- Уважение к каждому участнику\n- Безопасность и чистота',
        '## Our approach\n\nWe believe training should be accessible, understandable and genuinely enjoyable.\n\n## Values\n\n- Honesty about results\n- Respect for every member\n- Safety and cleanliness',
      ),
    },
    images: { image: img(PHOTOS.gymBright, lt('Жарық зал', 'Светлый тренажёрный зал', 'Bright training floor')) },
    items: [
      {
        title: lt('Миссия', 'Миссия', 'Mission'),
        body: lt(
          'Адамдарға күшті және сенімді болуға көмектесу.',
          'Помогать людям становиться сильнее и увереннее.',
          'Help people become stronger and more confident.',
        ),
      },
      {
        title: lt('Команда', 'Команда', 'Team'),
        body: lt(
          'Жаттықтырушылар, ресепшен және сервис мамандары.',
          'Тренеры, ресепшен и специалисты сервиса.',
          'Coaches, reception and member-care specialists.',
        ),
      },
    ],
  },
  'personal-training': {
    fields: {
      title: lt('Жеке жаттығу', 'Персональные тренировки', 'Personal training'),
      lead: lt(
        'Сіздің мақсатыңызға арналған жеке бағдарлама.',
        'Индивидуальная программа под вашу цель.',
        'A programme built around your goal — and your life.',
      ),
      body: lt(
        'Жаттықтырушы бастапқы деңгейіңізді бағалап, апталық жоспар құрады және прогресті жеке кабинетте бақылайды.',
        'Тренер оценит ваш уровень, составит недельный план и будет отслеживать прогресс в личном кабинете.',
        'Your coach assesses your starting point, builds a weekly plan and tracks progress with you in the member portal.',
      ),
    },
    images: {
      image: img(PHOTOS.trainerD, lt('Жаттықтырушы гантельмен', 'Тренер с гантелью', 'Coach working with dumbbells')),
    },
    items: [
      {
        title: lt('1. Танысу', '1. Знакомство', '1. Consultation'),
        body: lt(
          'Мақсаттар мен шектеулерді талқылаймыз.',
          'Обсуждаем цели и ограничения.',
          'We discuss goals, history and schedule.',
        ),
      },
      {
        title: lt('2. Бағдарлама', '2. Программа', '2. Programme'),
        body: lt(
          'Жаттығулар, жүктеме және демалыс.',
          'Упражнения, нагрузка и отдых.',
          'Exercises, load and recovery, planned week by week.',
        ),
      },
      {
        title: lt('3. Прогресс', '3. Прогресс', '3. Progress'),
        body: lt(
          'Әр жаттығуды журналда белгілейсіз.',
          'Каждую тренировку вы отмечаете в журнале.',
          'Log each workout and see your trend.',
        ),
      },
    ],
  },
  facilities: {
    fields: {
      title: lt('Клуб инфрақұрылымы', 'Инфраструктура клуба', 'Club facilities'),
      lead: lt(
        'Жаттығу мен қалпына келу үшін барлығы бар.',
        'Всё необходимое для тренировок и восстановления.',
        'Everything you need to train hard and recover well.',
      ),
    },
  },
  'legal.privacy': {
    fields: {
      title: lt('Құпиялылық саясаты', 'Политика конфиденциальности', 'Privacy policy'),
      body: lt(
        '**Демо-мәтін.** Бұл құжатты іске қосу алдында заңгер тексеруі тиіс.\n\n## Қандай деректерді жинаймыз\n\nАты-жөні, email, телефон, абонемент пен келу тарихы.\n\n## Мақсаты\n\nКлуб қызметтерін көрсету, жазылуды басқару және хабарландырулар.\n\n## Сақтау\n\nДеректер Қазақстан Республикасының «Дербес деректер және оларды қорғау туралы» Заңына сәйкес өңделеді.\n\n## Сіздің құқықтарыңыз\n\nДеректерге қол жеткізу, түзету және жоюды сұрау.',
        '**Демо-текст.** Перед запуском документ должен проверить юрист.\n\n## Какие данные мы собираем\n\nФИО, email, телефон, история абонементов и посещений.\n\n## Цели\n\nОказание услуг клуба, управление записями и уведомления.\n\n## Хранение\n\nДанные обрабатываются в соответствии с Законом Республики Казахстан «О персональных данных и их защите».\n\n## Ваши права\n\nДоступ к данным, их исправление и удаление по запросу.',
        '**Demo text.** Have this document reviewed by a lawyer before launch.\n\n## Data we collect\n\nName, e-mail, phone, membership and visit history.\n\n## Purpose\n\nProviding club services, managing bookings and sending notifications.\n\n## Storage\n\nData is processed in line with the Law of the Republic of Kazakhstan “On Personal Data and Their Protection”.\n\n## Your rights\n\nAccess, correction and deletion of your data on request.',
      ),
    },
  },
  'legal.terms': {
    fields: {
      title: lt('Пайдалану шарттары', 'Условия использования', 'Terms and conditions'),
      body: lt(
        '**Демо-мәтін.** Іске қосу алдында заңгермен келісіңіз.\n\n## Абонементтер\n\nАбонемент төлем расталғаннан кейін белсендіріледі. Тоқтату абонемент шарттарына сәйкес.\n\n## Сабаққа жазылу\n\nСабақ басталғанға дейін 6 сағаттан кейін болдырмау кеш деп саналады.\n\n## Клуб ережелері\n\nҚауіпсіздік техникасы мен жаттықтырушылардың нұсқауларын сақтаңыз.',
        '**Демо-текст.** Согласуйте с юристом перед запуском.\n\n## Абонементы\n\nАбонемент активируется после подтверждения оплаты. Заморозка — по условиям тарифа.\n\n## Запись на занятия\n\nОтмена менее чем за 6 часов до начала считается поздней.\n\n## Правила клуба\n\nСоблюдайте технику безопасности и указания тренеров.',
        '**Demo text.** Have these terms reviewed before launch.\n\n## Memberships\n\nA membership is activated once payment is confirmed. Freezes follow the plan rules.\n\n## Class bookings\n\nCancelling less than 6 hours before the start counts as a late cancellation.\n\n## Club rules\n\nFollow safety guidance and your coach’s instructions.',
      ),
    },
  },
};

export const FAQ: { q: LocalizedText; a: LocalizedText; category: 'membership' | 'classes' | 'club' | 'payments' }[] = [
  {
    category: 'membership',
    q: lt('Абонементті тоқтатуға бола ма?', 'Можно ли заморозить абонемент?', 'Can I freeze my membership?'),
    a: lt(
      'Иә, тарифке байланысты 14–60 күнге дейін. Тоқтату жеке кабинетте рәсімделеді.',
      'Да, в зависимости от тарифа — от 14 до 60 дней. Заморозку можно оформить в личном кабинете.',
      'Yes — 14 to 60 days depending on your plan. You can schedule a freeze in the member portal.',
    ),
  },
  {
    category: 'membership',
    q: lt(
      'Абонемент барлық филиалдарда жарамды ма?',
      'Действует ли абонемент во всех филиалах?',
      'Does my membership work in every branch?',
    ),
    a: lt(
      'Unlimited, Quarter және Annual тарифтері — иә. Start тарифі тек Алматы филиалдарында.',
      'Тарифы Unlimited, Quarter и Annual — да. Тариф Start действует только в филиалах Алматы.',
      'Unlimited, Quarter and Annual plans do. The Start plan covers the Almaty branches only.',
    ),
  },
  {
    category: 'classes',
    q: lt('Сабаққа қалай жазыламын?', 'Как записаться на занятие?', 'How do I book a class?'),
    a: lt(
      'Кестеден сабақты таңдап, «Жазылу» батырмасын басыңыз. Орын болмаса — күту тізіміне қосылыңыз.',
      'Выберите занятие в расписании и нажмите «Записаться». Если мест нет — встаньте в лист ожидания.',
      'Pick a class in the schedule and tap “Book”. If it is full, join the waitlist and we will move you in automatically.',
    ),
  },
  {
    category: 'classes',
    q: lt('Жазылудан қашан бас тартуға болады?', 'Когда можно отменить запись?', 'How late can I cancel?'),
    a: lt(
      'Сабақ басталғанға дейін кез келген уақытта. 6 сағаттан аз қалғанда — кеш болдырмау.',
      'В любой момент до начала занятия. Менее чем за 6 часов отмена считается поздней.',
      'Any time before the class starts. Within 6 hours of the start it counts as a late cancellation.',
    ),
  },
  {
    category: 'payments',
    q: lt('Қалай төлеуге болады?', 'Как можно оплатить?', 'How can I pay?'),
    a: lt(
      'Ресепшенде қолма-қол немесе картамен. Онлайн-төлем банк-серіктеспен келісімнен кейін қосылады.',
      'На ресепшене наличными или картой. Онлайн-оплата подключается после договора с банком-эквайером.',
      'At reception by cash or card. Online payment is enabled once a local acquiring bank is connected.',
    ),
  },
  {
    category: 'club',
    q: lt('Сынақ сабағы бар ма?', 'Есть ли пробное занятие?', 'Is there a trial visit?'),
    a: lt(
      'Иә, 3 күндік тегін сынақ абонементі бар (бір рет).',
      'Да, есть бесплатный пробный абонемент на 3 дня (один раз).',
      'Yes — a free 3-day trial pass, once per person.',
    ),
  },
  {
    category: 'club',
    q: lt('Клубқа не алып келу керек?', 'Что взять с собой в клуб?', 'What should I bring?'),
    a: lt(
      'Спорттық киім, ауыстыратын аяқ киім және сүлгі. Шкафтар тегін.',
      'Спортивную форму, сменную обувь и полотенце. Шкафчики бесплатные.',
      'Training clothes, clean indoor shoes and a towel. Lockers are free.',
    ),
  },
  {
    category: 'payments',
    q: lt('Студенттік жеңілдік бар ма?', 'Есть ли студенческая скидка?', 'Do you offer a student discount?'),
    a: lt(
      'Иә, студенттік билетпен ресепшенде рәсімделеді.',
      'Да, оформляется на ресепшене при предъявлении студенческого билета.',
      'Yes — issued at reception on presentation of a valid student ID.',
    ),
  },
];

export const TESTIMONIALS = [
  {
    authorName: 'Aruzhan K.',
    detail: lt('Клуб мүшесі · демо-пікір', 'Участница клуба · демо-отзыв', 'Member · demo review'),
    quote: lt(
      'Жаттықтырушылар өте мұқият, кесте ыңғайлы. Үш айда айтарлықтай нәтиже.',
      'Очень внимательные тренеры и удобное расписание. За три месяца — заметный результат.',
      'Attentive coaches and a schedule that actually fits my week. Real progress in three months.',
    ),
    rating: 5,
  },
  {
    authorName: 'Daniyar S.',
    detail: lt('Клуб мүшесі · демо-пікір', 'Участник клуба · демо-отзыв', 'Member · demo review'),
    quote: lt(
      'Бокс сабақтары — керемет. Онлайн жазылу уақытты үнемдейді.',
      'Бокс — огонь. Онлайн-запись экономит кучу времени.',
      'The boxing classes are brilliant, and booking online saves me so much time.',
    ),
    rating: 5,
  },
  {
    authorName: 'Elena M.',
    detail: lt('Клуб мүшесі · демо-пікір', 'Участница клуба · демо-отзыв', 'Member · demo review'),
    quote: lt(
      'Йога мен созылу — аптаның ең жақсы бөлігі.',
      'Йога и растяжка — лучшая часть моей недели.',
      'Yoga and mobility sessions are the best part of my week.',
    ),
    rating: 5,
  },
  {
    authorName: 'Timur A.',
    detail: lt('Клуб мүшесі · демо-пікір', 'Участник клуба · демо-отзыв', 'Member · demo review'),
    quote: lt(
      'Жеке бағдарлама және прогресс журналы мотивацияны сақтайды.',
      'Персональная программа и журнал прогресса держат мотивацию.',
      'The personal programme and progress log keep me accountable.',
    ),
    rating: 4,
  },
  {
    authorName: 'Saule B.',
    detail: lt('Клуб мүшесі · демо-пікір', 'Участница клуба · демо-отзыв', 'Member · demo review'),
    quote: lt(
      'Таза, жарық және жайлы. Астана филиалындағы бассейн — ғажап.',
      'Чисто, светло и уютно. Бассейн в Астане — восторг.',
      'Clean, bright and welcoming. The pool in Astana is a highlight.',
    ),
    rating: 5,
  },
];

export const FACILITIES = [
  {
    slug: 'free-weights',
    icon: 'dumbbell',
    name: lt('Еркін салмақ аймағы', 'Зона свободных весов', 'Free-weight zone'),
    description: lt(
      'Штангалар, гантельдер 2–60 кг, платформалар.',
      'Штанги, гантели 2–60 кг, помосты.',
      'Barbells, 2–60 kg dumbbells and lifting platforms.',
    ),
    image: PHOTOS.dumbbells,
  },
  {
    slug: 'cardio',
    icon: 'heart-pulse',
    name: lt('Кардио аймағы', 'Кардиозона', 'Cardio deck'),
    description: lt(
      'Жүгіру жолдары, ескек және велотренажерлар.',
      'Беговые дорожки, гребные и велотренажёры.',
      'Treadmills, rowers and bikes with heart-rate tracking.',
    ),
    image: PHOTOS.gymBright,
  },
  {
    slug: 'studios',
    icon: 'users',
    name: lt('Топтық студиялар', 'Студии групповых программ', 'Group studios'),
    description: lt(
      'Акустикасы жақсы үш студия.',
      'Три студии с хорошей акустикой и светом.',
      'Three studios with sprung floors, sound and light.',
    ),
    image: PHOTOS.groupMat,
  },
  {
    slug: 'pool',
    icon: 'waves',
    name: lt('Бассейн', 'Бассейн', 'Swimming pool'),
    description: lt(
      '25 метрлік бассейн (Астана филиалы).',
      '25-метровый бассейн (филиал Астана).',
      '25-metre lap pool (Astana branch).',
    ),
    image: PHOTOS.pool,
  },
  {
    slug: 'recovery',
    icon: 'flame',
    name: lt('Сауна және қалпына келу', 'Сауна и восстановление', 'Sauna & recovery'),
    description: lt(
      'Фин саунасы және созылу аймағы.',
      'Финская сауна и зона растяжки.',
      'Finnish sauna and a quiet stretching area.',
    ),
    image: PHOTOS.stretch,
  },
  {
    slug: 'lockers',
    icon: 'lock',
    name: lt('Киім ауыстыратын бөлмелер', 'Раздевалки', 'Locker rooms'),
    description: lt(
      'Электронды шкафтар және душ.',
      'Электронные шкафчики и душевые.',
      'Digital lockers, showers and hair dryers.',
    ),
    image: PHOTOS.interior1,
  },
];

export const GALLERY = [
  { url: PHOTOS.gymFloor, category: 'gym', caption: lt('Негізгі зал', 'Основной зал', 'Main training floor') },
  { url: PHOTOS.dumbbellRow, category: 'gym', caption: lt('Гантельдер', 'Гантельный ряд', 'Dumbbell row') },
  {
    url: PHOTOS.groupMat,
    category: 'studio',
    caption: lt('Функционалдық сабақ', 'Функциональный класс', 'Functional class'),
  },
  { url: PHOTOS.yogaGroup, category: 'studio', caption: lt('Йога студиясы', 'Студия йоги', 'Yoga studio') },
  { url: PHOTOS.pool, category: 'pool', caption: lt('Бассейн', 'Бассейн', 'Pool') },
  { url: PHOTOS.stretch, category: 'recovery', caption: lt('Созылу', 'Растяжка', 'Mobility') },
  { url: PHOTOS.ropes, category: 'gym', caption: lt('Функционалдық аймақ', 'Функциональная зона', 'Functional zone') },
  { url: PHOTOS.rowing, category: 'gym', caption: lt('Кардио', 'Кардио', 'Cardio') },
  { url: PHOTOS.groupHands, category: 'community', caption: lt('Қауымдастық', 'Комьюнити', 'Community') },
  { url: PHOTOS.interior2, category: 'gym', caption: lt('Зал', 'Зал', 'Gym interior') },
  { url: PHOTOS.interior3, category: 'gym', caption: lt('Кардио аймағы', 'Кардиозона', 'Cardio zone') },
  { url: PHOTOS.yogaSilhouette, category: 'studio', caption: lt('Таңғы йога', 'Утренняя йога', 'Morning yoga') },
];

export const BLOG = [
  {
    slug: 'how-to-start-strength-training',
    cover: PHOTOS.deadlift,
    tags: ['strength', 'beginners'],
    daysAgo: 6,
    title: lt('Күш жаттығуын қалай бастау керек', 'Как начать силовые тренировки', 'How to start strength training'),
    excerpt: lt(
      'Алғашқы төрт аптаға арналған қарапайым жоспар.',
      'Простой план на первые четыре недели.',
      'A simple plan for your first four weeks.',
    ),
    body: lt(
      '## Негіз\n\nАптасына 2–3 жаттығудан бастаңыз. Техника салмақтан маңызды.\n\n## Жоспар\n\n1. Отыру\n2. Итеру\n3. Тарту\n\nӘр жаттығуды 3×8–10 қайталаумен орындаңыз.',
      '## Основа\n\nНачните с 2–3 тренировок в неделю. Техника важнее веса.\n\n## План\n\n1. Приседание\n2. Жим\n3. Тяга\n\nВыполняйте каждое упражнение 3×8–10 повторений.',
      '## The foundation\n\nStart with two or three sessions a week. Technique matters more than load.\n\n## The plan\n\n1. Squat\n2. Press\n3. Pull\n\nDo each movement for 3 sets of 8–10 reps.',
    ),
  },
  {
    slug: 'recovery-matters',
    cover: PHOTOS.stretch,
    tags: ['recovery'],
    daysAgo: 14,
    title: lt('Қалпына келу неге маңызды', 'Почему восстановление важно', 'Why recovery matters'),
    excerpt: lt(
      'Ұйқы, созылу және белсенді демалыс.',
      'Сон, растяжка и активный отдых.',
      'Sleep, mobility and active rest.',
    ),
    body: lt(
      'Бұлшықеттер жаттығу кезінде емес, демалыс кезінде өседі. Күніне 7–9 сағат ұйықтаңыз және аптасына бір рет созылу сабағына барыңыз.',
      'Мышцы растут не на тренировке, а во время отдыха. Спите 7–9 часов и раз в неделю посещайте занятие по растяжке.',
      'Muscles grow while you rest, not while you train. Aim for 7–9 hours of sleep and add one mobility class a week.',
    ),
  },
  {
    slug: 'new-cycle-studio-astana',
    cover: PHOTOS.interior3,
    tags: ['news'],
    daysAgo: 24,
    title: lt('Астанадағы жаңа кардио аймағы', 'Новая кардиозона в Астане', 'A new cardio zone in Astana'),
    excerpt: lt(
      'Есіл филиалында жаңартылған кардио аймағы ашылды.',
      'В филиале Есиль открылась обновлённая кардиозона.',
      'Our Yesil branch opened a refreshed cardio zone.',
    ),
    body: lt(
      'Жаңа жабдық, жақсартылған желдету және тыныш аймақ. Клуб мүшелері үшін қосымша ақысыз.',
      'Новое оборудование, улучшенная вентиляция и тихая зона. Без доплаты для участников клуба.',
      'New equipment, better ventilation and a quiet corner — included in every membership.',
    ),
  },
];
