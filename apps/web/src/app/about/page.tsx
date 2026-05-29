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
      <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-400">{children}</div>
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
            className="inline-flex items-center gap-1 rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label="До карти"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="text-base font-semibold text-zinc-100">Про проєкт</div>
            <div className="text-xs text-zinc-500">deshahed</div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-7 px-4 py-6 pb-[max(2rem,var(--safe-bottom))]">
        <h1 className="text-2xl font-semibold text-zinc-100">Про проєкт deshahed</h1>
        <p className="text-sm leading-relaxed text-zinc-300">
          <strong className="text-zinc-100">deshahed</strong> — це безкоштовна інтерактивна
          карта повітряних тривог та повідомлень про БпЛА і ракетну небезпеку в Україні
          в реальному часі. Проєкт зібрано з відкритих джерел, щоб одним поглядом бачити
          загальну картину по всій країні — від областей до окремих громад.
        </p>

        <Section title="Джерела даних">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-zinc-200">Повітряні тривоги</strong> — публічні дані
              сервісу <span className="text-zinc-200">alerts.in.ua</span> (області, райони,
              громади, міста).
            </li>
            <li>
              <strong className="text-zinc-200">БпЛА та ракети</strong> — OSINT-моніторинг
              відкритих Telegram-каналів, що повідомляють про рух «шахедів», ракет та КАБів;
              текст автоматично розпізнається та геокодується.
            </li>
            <li>
              <strong className="text-zinc-200">Межі регіонів</strong> — OpenStreetMap
              (© OSM contributors, ODbL): області, райони та територіальні громади.
            </li>
            <li>
              <strong className="text-zinc-200">Укриття</strong> — позначки укриттів з
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
            Доступні також <Link className="underline hover:text-zinc-200" href="/stats">статистика</Link>,{" "}
            <Link className="underline hover:text-zinc-200" href="/timelapse">тайм-лапс за добу</Link> та
            сторінки кожного <Link className="underline hover:text-zinc-200" href="/regions">регіону</Link>.
          </p>
        </Section>

        <Section title="Важливо — це не офіційне джерело">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-100">
            Дані зібрані з відкритих джерел (OSINT) і можуть містити затримки, помилки або
            неповну інформацію. <strong>Не приймайте рішення про власну безпеку лише на основі
            цієї карти.</strong> Офіційне джерело сповіщень — застосунок «Повітряна тривога»
            та офіційні канали ДСНС і влади. Під час тривоги прямуйте в укриття.
          </div>
        </Section>

        <Section title="Безкоштовно та відкрито">
          <p>
            Проєкт безкоштовний і без реклами. Ви можете безкоштовно вбудувати{" "}
            <Link className="underline hover:text-zinc-200" href="/embed">віджет статусу тривоги</Link>{" "}
            для своєї області на власний сайт або стрім.
          </p>
          <p>
            Підтримати розвиток проєкту можна добровільним внеском:{" "}
            <a
              className="text-rose-300 underline hover:text-rose-200"
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
