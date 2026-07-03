import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SUPPORT_URL } from "@/lib/links";

const SITE = "https://xn----8sbkccc5iwa.online";

export const metadata: Metadata = {
  title: "Про проєкт — deshahed",
  description:
    "Що таке deshahed, звідки беруться дані про повітряні тривоги та БпЛА, як працює карта і чому це не офіційне джерело. Методологія та джерела.",
  alternates: { canonical: `${SITE}/about` },
  openGraph: {
    title: "Про проєкт — deshahed",
    description: "Джерела даних, методологія та застереження карти повітряних тривог deshahed.",
    url: `${SITE}/about`,
    siteName: "deshahed",
    locale: "uk_UA",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "deshahed — про проєкт" }],
  },
};

const SCHEMA = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "Про проєкт deshahed",
  url: `${SITE}/about`,
  isPartOf: { "@type": "WebSite", name: "deshahed", url: SITE },
  publisher: {
    "@type": "Organization",
    name: "deshahed",
    url: SITE,
  },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-fg-muted">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/95 pt-[var(--safe-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded p-1.5 text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="До карти"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="text-base font-semibold text-fg">Про проєкт</div>
            <div className="text-xs text-fg-subtle">deshahed</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-7 px-4 py-6 pb-[max(2rem,var(--safe-bottom))]">
        <h1 className="text-2xl font-semibold text-fg">Про проєкт deshahed</h1>
        <p className="text-sm leading-relaxed text-fg-muted">
          <strong className="text-fg">deshahed</strong> — це безкоштовна інтерактивна
          карта повітряних тривог та повідомлень про БпЛА і ракетну небезпеку в Україні
          в реальному часі. Проєкт зібрано з відкритих джерел, щоб одним поглядом бачити
          загальну картину по всій країні — від областей до окремих громад.
        </p>

        <Section title="Джерела даних">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-fg">Повітряні тривоги</strong> — публічні дані
              сервісу <span className="text-fg">alerts.in.ua</span> (області, райони,
              громади, міста).
            </li>
            <li>
              <strong className="text-fg">БпЛА та ракети</strong> — OSINT-моніторинг
              відкритих Telegram-каналів, що повідомляють про рух «шахедів», ракет та КАБів;
              текст автоматично розпізнається та геокодується.
            </li>
            <li>
              <strong className="text-fg">Межі регіонів</strong> — OpenStreetMap
              (© OSM contributors, ODbL): області, райони та територіальні громади.
            </li>
            <li>
              <strong className="text-fg">Укриття</strong> — позначки укриттів з
              OpenStreetMap (увімкніть шар на карті).
            </li>
          </ul>
        </Section>

        <Section title="Як це працює">
          <p>
            Карта оновлюється в реальному часі. Колір регіону показує стан тривоги
            (повітряна тривога, загроза артобстрілу, вуличних боїв). При наближенні з’являються
            райони та громади з власним станом. Значки ракет і «шахедів» обертаються
            у бік свого руху, а стрілка позначає напрямок прильоту.
          </p>
          <p>
            Доступні також <Link className="underline hover:text-fg" href="/stats">статистика</Link>,{" "}
            <Link className="underline hover:text-fg" href="/timelapse">тайм-лапс за добу</Link> та
            сторінки кожного <Link className="underline hover:text-fg" href="/regions">регіону</Link>.
          </p>
        </Section>

        <Section title="Застосунок для Android">
          <p>
            Доступний застосунок для Android — це та сама карта у вигляді
            окремого додатку на весь екран, зі сповіщеннями про тривоги.
          </p>
          <a
            href="/deshahed.apk"
            download
            className="inline-flex items-center gap-2 rounded-lg border border-safe/60 bg-safe/10 px-4 py-2.5 text-sm font-medium text-safe transition hover:bg-safe/20"
          >
            ⬇ Завантажити APK для Android
          </a>
          <p className="text-[12px] text-fg-subtle">
            Після завантаження відкрийте файл і дозвольте встановлення з цього
            джерела. На iPhone застосунку немає — відкрийте сайт у Safari та
            додайте на головний екран.
          </p>
        </Section>

        <Section title="Важливо — це не офіційне джерело">
          <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-warn">
            Дані зібрані з відкритих джерел (OSINT) і можуть містити затримки, помилки або
            неповну інформацію. <strong>Не приймайте рішення про власну безпеку лише на основі
            цієї карти.</strong> Офіційне джерело сповіщень — застосунок «Повітряна тривога»
            та офіційні канали ДСНС і влади. Під час тривоги прямуйте в укриття.
          </div>
        </Section>

        <Section title="Безкоштовно та відкрито">
          <p>
            Проєкт безкоштовний і без реклами. Ви можете безкоштовно вбудувати{" "}
            <Link className="underline hover:text-fg" href="/embed">віджет статусу тривоги</Link>{" "}
            для своєї області на власний сайт або стрім.
          </p>
          <p>
            Підтримати розвиток проєкту можна добровільним внеском:{" "}
            <a
              className="text-alert underline hover:text-alert/80"
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              банка на monobank
            </a>
            .
          </p>
        </Section>

        <Section title="Зворотний зв’язок">
          <p>
            Помітили помилку в даних або маєте пропозицію? Будемо вдячні за зворотний
            зв’язок — це допомагає робити карту точнішою.
          </p>
        </Section>
      </div>

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SCHEMA) }}
      />
    </main>
  );
}
