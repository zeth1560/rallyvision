import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ReplayTrove',
  description:
    'ReplayTrove gives pickleball players courtside instant replays, optional full-game recording, and downloadable HD footage.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-slate-950 font-sans">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-6 py-12 sm:px-10 lg:px-14">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-10 py-16">
          <div className="flex flex-col gap-6">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              ReplayTrove for pickleball
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Relive the point. Review the game. Keep the highlights.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">
              ReplayTrove gives pickleball players courtside instant replays, optional
              full-game recording, and downloadable HD footage they can enjoy, share,
              study, or use for coaching.
            </p>
            <p className="max-w-3xl text-sm leading-6 text-slate-500">
              ReplayTrove does not automatically record every replay or every game.
              Players choose when to capture and review the moments that matter.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href="#"
              className="inline-flex w-full items-center justify-center rounded-full bg-slate-950 px-6 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
            >
              View a Sample Session
            </a>
            <a
              href="#clubs"
              className="inline-flex w-full items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-4 text-sm font-semibold text-slate-950 transition hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
            >
              For Clubs
            </a>
          </div>
        </section>

        <section className="grid gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="space-y-6">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              For Players
            </p>
            <div className="space-y-4">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                Your game, ready when you want it.
              </h2>
              <p className="max-w-2xl text-base leading-8 text-slate-600">
                With ReplayTrove, players can view instant replays right at the court
                after great shots, close calls, and moments worth another look.
                Players can also choose to record their full game, then download HD
                footage afterward for personal enjoyment, social sharing, deeper game
                study, or online and AI coaching.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">
                Watch instant replays courtside
              </h3>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">
                Record full games by choice
              </h3>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">
                Download full HD footage
              </h3>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">
                Share, study, or get coached
              </h3>
            </div>
          </div>
        </section>

        <section id="clubs" className="grid gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-6">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              For Clubs
            </p>
            <div className="space-y-4">
              <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                Add video replay without adding staff headaches.
              </h2>
              <p className="max-w-2xl text-base leading-8 text-slate-600">
                ReplayTrove helps pickleball clubs offer courtside replay, optional
                full-game recording, and downloadable player footage without needing a
                production crew or complicated manual workflow.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">
                Better player experience
              </h3>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">
                New revenue opportunity
              </h3>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">
                Great for leagues, lessons, events, and tournaments
              </h3>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="text-lg font-semibold text-slate-950">
                Built for simple club operations
              </h3>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-slate-50 p-10 sm:p-12">
          <div className="space-y-5">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
              Pilot
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
              Now testing at The Rally Club
            </h2>
            <p className="text-base leading-8 text-slate-600">
              ReplayTrove is currently being tested on the North Court at The Rally Club
              while the system is refined. During the pilot period, clips and recordings
              may be available free while bugs are worked out and feedback is gathered.
            </p>
          </div>
        </section>

        <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 rounded-3xl border border-slate-200 bg-slate-950 p-10 text-white sm:p-12">
          <div className="space-y-4">
            <h2 className="text-3xl font-semibold tracking-tight">
              Want ReplayTrove at your club?
            </h2>
            <p className="max-w-3xl text-base leading-8 text-slate-200">
              ReplayTrove is built for clubs that want to offer courtside replay,
              player-controlled recording, and post-session video downloads without
              needing a full production crew.
            </p>
          </div>
          <a
            href="mailto:seth@regularguycreative.com"
            className="inline-flex w-fit rounded-full bg-white px-6 py-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            Contact Us
          </a>
        </section>
      </div>
    </main>
  );
}
