import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./Landing.css";

gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    n: "01",
    title: "Charter the authority",
    body: "Set budget, city, dates, nightly caps, and allowlisted merchants. Sign once as an Intent Mandate on the website.",
    label: "Intent Mandate",
    scene: "mandate",
  },
  {
    n: "02",
    title: "Issue the agent key",
    body: "Grok gets a scoped Bearer token for /api/v1. Agents hit your real HTTPS API, not a fake checkout page.",
    label: "Agent access",
    scene: "key",
  },
  {
    n: "03",
    title: "Price to Payment Mandate",
    body: "HotelAgent and FlightAgent return conditions. Charter builds the HSP Payment Mandate, or blocks the spend.",
    label: "A2A settle",
    scene: "settle",
  },
  {
    n: "04",
    title: "Notify while you’re away",
    body: "Telegram and AgentMail send a short summary for every settle and every deny. Open the desk when you’re back.",
    label: "Human notified",
    scene: "notify",
  },
] as const;

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.add("is-ready");

    const nav = root.querySelector<HTMLElement>(".ch-nav");
    const darkZones = () =>
      Array.from(root.querySelectorAll<HTMLElement>(".ch-hero, .ch-marquee, .ch-story, .ch-api"));
    const syncNavTone = () => {
      if (!nav) return;
      const probe = 36;
      let onDark = window.scrollY < 60;
      for (const zone of darkZones()) {
        const r = zone.getBoundingClientRect();
        if (r.top <= probe && r.bottom >= probe) {
          onDark = true;
          break;
        }
      }
      nav.classList.toggle("on-dark", onDark);
      nav.classList.toggle("on-light", !onDark);
    };
    syncNavTone();
    window.addEventListener("scroll", syncNavTone, { passive: true });
    window.addEventListener("resize", syncNavTone);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      root.classList.add("is-static");
      nav?.classList.add("on-dark");
      return () => {
        window.removeEventListener("scroll", syncNavTone);
        window.removeEventListener("resize", syncNavTone);
      };
    }

    const ctx = gsap.context(() => {
      // —— Hero field ——
      gsap.to(".hx-ring", {
        rotate: 360,
        duration: 40,
        repeat: -1,
        ease: "none",
        transformOrigin: "50% 50%",
      });
      gsap.to(".hx-ring-slow", {
        rotate: -360,
        duration: 55,
        repeat: -1,
        ease: "none",
        transformOrigin: "50% 50%",
      });
      gsap.fromTo(
        ".hx-stack > *",
        { y: 48, opacity: 0, filter: "blur(8px)" },
        {
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          stagger: 0.14,
          duration: 1.05,
          ease: "power3.out",
          delay: 0.3,
        },
      );
      gsap.to(".hx-float", {
        y: -12,
        duration: 3.4,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        stagger: { each: 0.35, from: "center" },
        delay: 1.4,
      });
      gsap.to(".hx-glow.a", {
        scale: 1.12,
        opacity: 0.85,
        duration: 5,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });
      gsap.to(".hx-glow.b", {
        scale: 1.18,
        x: -30,
        duration: 6.5,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });

      // Marquee
      gsap.to(".ch-marquee-track", {
        xPercent: -50,
        duration: 28,
        ease: "none",
        repeat: -1,
      });

      // Soft section reveals — blur + lift, not bare fades
      gsap.utils.toArray<HTMLElement>("[data-fade]").forEach((el) => {
        gsap.fromTo(
          el,
          { y: 56, opacity: 0, filter: "blur(10px)" },
          {
            y: 0,
            opacity: 1,
            filter: "blur(0px)",
            duration: 1.15,
            ease: "power3.out",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          },
        );
      });

      // Pillars stagger as a set
      const pillars = root.querySelector(".ch-pillars-inner");
      if (pillars) {
        gsap.set(pillars.children, { y: 40, opacity: 0, filter: "blur(8px)" });
        gsap.to(pillars.children, {
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          stagger: 0.12,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: pillars, start: "top 82%", once: true },
        });
      }

      // Contrast scrub
      const contrast = root.querySelector<HTMLElement>(".ch-contrast");
      if (contrast) {
        gsap.fromTo(
          contrast.querySelector(".ch-contrast-veil"),
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: "none",
            transformOrigin: "left center",
            scrollTrigger: {
              trigger: contrast,
              start: "top 70%",
              end: "center center",
              scrub: 0.55,
            },
          },
        );
        gsap.fromTo(
          contrast.querySelectorAll(".ch-contrast-col"),
          { y: 40, opacity: 0.25, filter: "blur(6px)" },
          {
            y: 0,
            opacity: 1,
            filter: "blur(0px)",
            stagger: 0.1,
            ease: "none",
            scrollTrigger: {
              trigger: contrast,
              start: "top 75%",
              end: "center center",
              scrub: 0.6,
            },
          },
        );
      }

      // Mandate film
      const story = root.querySelector<HTMLElement>(".ch-story");
      const steps = gsap.utils.toArray<HTMLElement>(".ch-step");
      const frames = gsap.utils.toArray<HTMLElement>(".ch-frame");
      const dots = gsap.utils.toArray<HTMLElement>(".ch-dot");
      const nums = gsap.utils.toArray<HTMLElement>(".ch-rail-num");

      if (story && steps.length && frames.length) {
        gsap.set(steps, { autoAlpha: 0, y: 32 });
        gsap.set(frames, { autoAlpha: 0, scale: 0.92, filter: "blur(8px)" });
        gsap.set(steps[0], { autoAlpha: 1, y: 0 });
        gsap.set(frames[0], { autoAlpha: 1, scale: 1, filter: "blur(0px)" });
        dots[0]?.classList.add("on");
        nums[0]?.classList.add("on");

        const sceneLoops = frames.map((frame) => buildSceneLoop(frame));
        sceneLoops[0]?.restart(true);

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: story,
            start: "top top",
            end: () => `+=${Math.round(window.innerHeight * steps.length * 0.95)}`,
            pin: true,
            scrub: 0.65,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const idx = Math.min(
                steps.length - 1,
                Math.floor(self.progress * steps.length + 0.001),
              );
              dots.forEach((d, i) => d.classList.toggle("on", i === idx));
              nums.forEach((n, i) => n.classList.toggle("on", i === idx));
              sceneLoops.forEach((loop, i) => {
                if (!loop) return;
                if (i === idx) {
                  if (!loop.isActive()) loop.restart(true);
                } else loop.pause(0);
              });
            },
          },
        });

        for (let i = 1; i < steps.length; i++) {
          const t = i;
          tl.to(
            steps[i - 1],
            { autoAlpha: 0, y: -36, filter: "blur(6px)", duration: 0.55, ease: "power2.in" },
            t,
          );
          tl.to(
            frames[i - 1],
            {
              autoAlpha: 0,
              scale: 0.94,
              xPercent: -6,
              rotateY: -6,
              filter: "blur(12px)",
              duration: 0.65,
              ease: "power2.in",
            },
            t,
          );
          tl.fromTo(
            steps[i],
            { autoAlpha: 0, y: 40, filter: "blur(8px)" },
            { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.65, ease: "power3.out" },
            t + 0.12,
          );
          tl.fromTo(
            frames[i],
            { autoAlpha: 0, scale: 1.06, xPercent: 7, rotateY: 8, filter: "blur(14px)" },
            {
              autoAlpha: 1,
              scale: 1,
              xPercent: 0,
              rotateY: 0,
              filter: "blur(0px)",
              duration: 0.75,
              ease: "power3.out",
            },
            t + 0.1,
          );
        }

        gsap.fromTo(
          ".ch-bar > i",
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: "none",
            scrollTrigger: {
              trigger: story,
              start: "top top",
              end: () => `+=${Math.round(window.innerHeight * steps.length * 0.95)}`,
              scrub: 0.65,
            },
          },
        );
      }

      // Terminal typing
      const term = root.querySelector<HTMLElement>(".ch-term-code");
      if (term) {
        const full = term.dataset.code ?? "";
        term.textContent = "";
        const obj = { i: 0 };
        gsap.to(obj, {
          i: full.length,
          duration: Math.min(4.5, full.length * 0.018),
          ease: "none",
          scrollTrigger: {
            trigger: ".ch-api",
            start: "top 60%",
            once: true,
          },
          onUpdate: () => {
            term.textContent = full.slice(0, Math.floor(obj.i));
          },
        });
      }

      // Product bento — orchestrated entrance
      const bento = root.querySelector(".ch-bento");
      if (bento) {
        const cards = gsap.utils.toArray<HTMLElement>(".ch-bento > .bn");
        gsap.set(cards, { y: 48, opacity: 0, filter: "blur(8px)" });
        gsap.set(".px-row, .bn-mini, .bn-toast, .bn-rail span", { opacity: 0, y: 14 });
        gsap.to(cards, {
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          stagger: 0.14,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: { trigger: bento, start: "top 78%", once: true },
        });
        gsap.to(".px-meter > i", {
          scaleX: 0.41,
          duration: 1.8,
          ease: "expo.out",
          transformOrigin: "left center",
          scrollTrigger: { trigger: ".bn-wide", start: "top 70%", once: true },
        });
        gsap.to(".px-row", {
          y: 0,
          opacity: 1,
          stagger: 0.12,
          duration: 0.65,
          ease: "power3.out",
          scrollTrigger: { trigger: ".bn-wide", start: "top 68%", once: true },
        });
        gsap.to(".bn-mini, .bn-toast, .bn-rail span", {
          y: 0,
          opacity: 1,
          stagger: 0.08,
          duration: 0.55,
          ease: "power2.out",
          scrollTrigger: { trigger: bento, start: "top 72%", once: true },
        });
      }

      // API terminal + close polish
      gsap.fromTo(
        ".ch-term",
        { y: 36, opacity: 0, rotateX: 6, transformOrigin: "50% 100%" },
        {
          y: 0,
          opacity: 1,
          rotateX: 0,
          duration: 1.1,
          ease: "power3.out",
          scrollTrigger: { trigger: ".ch-api", start: "top 70%", once: true },
        },
      );

      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: syncNavTone,
        onRefresh: syncNavTone,
      });

      ScrollTrigger.refresh();
    }, root);

    return () => {
      window.removeEventListener("scroll", syncNavTone);
      window.removeEventListener("resize", syncNavTone);
      ctx.revert();
    };
  }, []);

  const code = `curl -X POST http://localhost:8787/api/v1/settle \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"offerId":"offer_5f44551f"}'

→ Payment Mandate
→ HSP Gateway
→ notify(telegram, email)`;

  return (
    <div className="ch" ref={rootRef}>
      <header className="ch-nav on-dark">
        <div className="ch-nav-inner">
          <Link to="/" className="ch-logo">
            Charter
          </Link>
          <nav>
            <a href="#contrast">Why</a>
            <a href="#loop">Loop</a>
            <a href="#product">Product</a>
            <a href="#api">API</a>
            <Link to="/app" className="ch-nav-cta">
              Open desk
            </Link>
          </nav>
        </div>
      </header>

      {/* —— Cinematic hero —— */}
      <section className="ch-hero">
        <div className="ch-hero-bg" aria-hidden>
          <span className="hx-glow a" />
          <span className="hx-glow b" />
          <div className="hx-grid" />
          <svg className="hx-ring" viewBox="0 0 600 600">
            <circle cx="300" cy="300" r="240" fill="none" stroke="rgba(56,189,248,0.2)" strokeWidth="1" strokeDasharray="4 14" />
            <circle cx="300" cy="60" r="5" fill="#38bdf8" />
          </svg>
          <svg className="hx-ring-slow" viewBox="0 0 600 600">
            <circle cx="300" cy="300" r="180" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <circle cx="480" cy="300" r="4" fill="#fff" opacity="0.7" />
          </svg>
        </div>

        <div className="ch-hero-layout">
          <div className="ch-hero-copy">
            <p className="ch-eyebrow">Human Not Present · HashKey HSP</p>
            <h1>
              <span className="ch-display">Charter</span>
              <span className="ch-line">Approve once.</span>
              <span className="ch-line accent">Agents settle while you’re away.</span>
            </h1>
            <p className="ch-lede">
              You approve an Intent Mandate once. AI agents like Grok, Muse, Dots, or any other call
              your API under that charter. HSP settles what fits your rules, and blocks what does
              not.
            </p>
            <div className="ch-cta">
              <Link to="/app" className="ch-btn">
                Open the desk
              </Link>
              <a href="#loop" className="ch-link">
                See the mandate loop
              </a>
            </div>
            <div className="ch-hero-meta">
              <div>
                <strong>AP2-shaped</strong>
                <span>Intent → Cart → Pay</span>
              </div>
              <div>
                <strong>HSP-shaped</strong>
                <span>Gateway settlement</span>
              </div>
              <div>
                <strong>A2A</strong>
                <span>Agent to agent</span>
              </div>
            </div>
          </div>

          <div className="ch-hero-stage" aria-hidden>
            <div className="hx-stack">
              <article className="hx-float hx-card main">
                <header>
                  <span>Tokyo weekend</span>
                  <em>Active</em>
                </header>
                <p className="hx-label">Remaining envelope</p>
                <strong>$570.00</strong>
                <small>of $900 · max $500 / payment</small>
                <div className="hx-meter">
                  <i />
                </div>
                <footer>
                  <span>Intent Mandate</span>
                  <span>signed</span>
                </footer>
              </article>
              <article className="hx-float hx-card side hotel a">
                <span>Hotel</span>
                <strong>Capsule Prime</strong>
                <em>$330 settled</em>
              </article>
              <article className="hx-float hx-card side flight b">
                <span>Flight</span>
                <strong>SkyBridge</strong>
                <em>$380 settled</em>
              </article>
              <article className="hx-float hx-card side mail c">
                <span>Inbox</span>
                <strong>Telegram</strong>
                <em>sent</em>
              </article>
            </div>
          </div>
        </div>
      </section>

      <div className="ch-marquee" aria-hidden>
        <div className="ch-marquee-track">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="ch-marquee-set">
              <span>Intent Mandate</span>
              <span>Payment conditions</span>
              <span>Payment Mandate</span>
              <span>HSP Gateway</span>
              <span>Agent API</span>
              <span>Deny path</span>
              <span>Telegram · AgentMail</span>
            </div>
          ))}
        </div>
      </div>

      {/* —— Contrast —— */}
      <section className="ch-contrast" id="contrast">
        <div className="ch-contrast-head" data-fade>
          <p className="ch-kicker dark">The problem Charter solves</p>
          <h2>
            Humans approve authority.
            <br />
            Agents move money.
          </h2>
        </div>
        <div className="ch-contrast-grid">
          <article className="ch-contrast-col present">
            <h3>Human present</h3>
            <p>You open Booking. You compare. You click pay. Every time. Agents can’t safely hold your card.</p>
          </article>
          <div className="ch-contrast-mid" aria-hidden>
            <div className="ch-contrast-veil" />
            <span>Charter</span>
          </div>
          <article className="ch-contrast-col absent">
            <h3>Human Not Present</h3>
            <p>You sign a charter once. Grok searches and settles under it. You get the receipt when you’re free.</p>
          </article>
        </div>
      </section>

      {/* —— Mandate film —— */}
      <section className="ch-story" id="loop">
        <div className="ch-story-inner">
          <aside className="ch-rail" aria-hidden>
            {STEPS.map((s) => (
              <div key={s.n} className="ch-rail-num">
                {s.n}
              </div>
            ))}
          </aside>

          <div className="ch-story-copy">
            <p className="ch-kicker">The mandate loop</p>
            <div className="ch-steps">
              {STEPS.map((s) => (
                <article key={s.n} className="ch-step">
                  <h2>{s.title}</h2>
                  <p>{s.body}</p>
                </article>
              ))}
            </div>
            <div className="ch-dots">
              {STEPS.map((s) => (
                <i key={s.n} className="ch-dot" />
              ))}
            </div>
            <div className="ch-bar">
              <i />
            </div>
          </div>

          <div className="ch-story-stage">
            {STEPS.map((s) => (
              <figure key={s.n} className="ch-frame" data-scene={s.scene}>
                {s.scene === "mandate" && <SceneMandate />}
                {s.scene === "key" && <SceneKey />}
                {s.scene === "settle" && <SceneSettle />}
                {s.scene === "notify" && <SceneNotify />}
                <figcaption>{s.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* —— Pillars —— */}
      <section className="ch-pillars">
        <div className="ch-pillars-inner">
          <article>
            <span>01</span>
            <h3>Authority first</h3>
            <p>Humans sign Intent Mandates. Agents never invent spend rights.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Conditions checked</h3>
            <p>Budget, merchant allowlist, and nightly caps gate every settle attempt.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Rails that settle</h3>
            <p>Payment Mandates clear on HashKey HSP. If they fail the charter, the deny path fires.</p>
          </article>
        </div>
      </section>

      {/* —— Product bento —— */}
      <section className="ch-product" id="product">
        <div className="ch-product-head" data-fade>
          <p className="ch-kicker dark">The desk</p>
          <h2>
            One surface for approval,
            <br />
            keys, settlement, and mail.
          </h2>
        </div>

        <div className="ch-bento">
          <article className="bn bn-wide">
            <div className="bn-copy">
              <p className="bn-tag">Live desk</p>
              <h3>The desk judges will actually click</h3>
              <p>
                Load the Tokyo charter, search hotels and flights, settle on HSP, and watch a
                blocked merchant fail. Same HTTPS path your agent uses.
              </p>
              <Link to="/app" className="ch-link dark">
                Open the desk →
              </Link>
            </div>
            <div className="px-desk" aria-hidden>
              <div className="px-desk-chrome">
                <span />
                <span />
                <span />
                <em>desk · tokyo</em>
              </div>
              <header>
                <span>Tokyo weekend</span>
                <em>Active</em>
              </header>
              <strong>$570.00</strong>
              <small>remaining envelope</small>
              <div className="px-meter">
                <i />
              </div>
              <div className="px-row">
                <span>Capsule Prime</span>
                <em>Settled · $330</em>
              </div>
              <div className="px-row">
                <span>SkyBridge Air</span>
                <em>Settled · $380</em>
              </div>
              <div className="px-row warn">
                <span>Pacific Hop</span>
                <em>Blocked · merchant</em>
              </div>
            </div>
          </article>

          <article className="bn bn-deny">
            <div className="bn-mini" aria-hidden>
              <div className="bn-mini-row fail">
                <span>Pacific Hop</span>
                <b>Blocked</b>
              </div>
              <div className="bn-mini-reason">Merchant not allowlisted</div>
            </div>
            <h3>Deny path</h3>
            <p>
              If budget, merchant, or nightly caps break the charter, settlement stops and you get
              notified.
            </p>
          </article>
          <article className="bn bn-mail">
            <div className="bn-mini stack" aria-hidden>
              <div className="bn-toast">
                <b>Telegram</b>
                <span>Settled · $380</span>
              </div>
              <div className="bn-toast dim">
                <b>AgentMail</b>
                <span>Blocked · Pacific</span>
              </div>
            </div>
            <h3>Away inbox</h3>
            <p>Telegram and AgentMail keep a running summary while you are offline.</p>
          </article>
          <article className="bn bn-span">
            <div className="bn-rail" aria-hidden>
              <span>Intent</span>
              <i />
              <span>Conditions</span>
              <i />
              <span>Payment</span>
              <i />
              <span className="ok">HSP</span>
            </div>
            <div>
              <h3>AP2 authority on HSP rails</h3>
              <p>
                Intent Mandate, payment conditions, Payment Mandate, then HashKey Gateway. Full
                Track 2 shape. Not an x402 unlock demo.
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* —— API —— */}
      <section className="ch-api" id="api">
        <div className="ch-api-inner">
          <div data-fade>
            <p className="ch-kicker">For agents</p>
            <h2>
              Not MCP-first.
              <br />
              HTTPS with a key.
            </h2>
            <p>
              Issue <code>chlive_…</code> from the desk. Grok calls search and settle under the
              charter. You stay Human Not Present.
            </p>
            <Link to="/app" className="ch-btn soft">
              Create a charter
            </Link>
          </div>
          <div className="ch-term" data-fade aria-hidden>
            <div className="ch-term-bar">
              <span />
              <span />
              <span />
              <em>agent · settle</em>
            </div>
            <pre className="ch-term-code" data-code={code} />
          </div>
        </div>
      </section>

      {/* —— Close —— */}
      <section className="ch-close" data-fade>
        <div className="ch-close-glow" aria-hidden />
        <p className="ch-kicker">Ready</p>
        <h2>
          Go do something else.
          <em> Your agent has a charter.</em>
        </h2>
        <p className="ch-close-lede">
          Draft a charter, sign the Intent Mandate, issue a Grok key. Hotels and flights settle under
          your rules on HSP, or get blocked when they do not.
        </p>
        <div className="ch-cta center">
          <Link to="/app" className="ch-btn">
            Open the desk
          </Link>
          <a href="#loop" className="ch-link dark">
            Replay the loop
          </a>
        </div>
      </section>

      <footer className="ch-foot">
        <span className="ch-logo">Charter</span>
        <span>HashKey Horizon · Track 2 · Human Not Present</span>
        <span>Intent → Cart → Pay on HSP</span>
      </footer>
    </div>
  );
}

function buildSceneLoop(frame: HTMLElement) {
  const scene = frame.dataset.scene;
  const tl = gsap.timeline({ repeat: -1, paused: true });

  if (scene === "mandate") {
    tl.fromTo(
      frame.querySelectorAll(".sc-line"),
      { scaleX: 0 },
      { scaleX: 1, stagger: 0.08, duration: 0.35, transformOrigin: "left center" },
    )
      .fromTo(
        frame.querySelector(".sc-stamp"),
        { scale: 1.5, opacity: 0, rotate: -18 },
        { scale: 1, opacity: 1, rotate: -12, duration: 0.7, ease: "back.out(1.7)" },
      )
      .to(frame.querySelector(".sc-stamp"), { scale: 1.06, duration: 0.5, yoyo: true, repeat: 1 })
      .to({}, { duration: 1.1 });
  }

  if (scene === "key") {
    tl.fromTo(
      frame.querySelectorAll(".sc-key-ch"),
      { y: 10, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.035, duration: 0.3 },
    )
      .fromTo(
        frame.querySelector(".sc-cred"),
        { y: 12, opacity: 0.7 },
        { y: 0, opacity: 1, duration: 0.45 },
        0,
      )
      .to(frame.querySelector(".sc-key-glow"), {
        opacity: 0.85,
        scale: 1.15,
        duration: 0.7,
        yoyo: true,
        repeat: 1,
        transformOrigin: "50% 50%",
      })
      .to({}, { duration: 0.9 });
  }

  if (scene === "settle") {
    tl.fromTo(
      frame.querySelectorAll(".sc-node"),
      { y: 12, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.12, duration: 0.4 },
    )
      .fromTo(
        frame.querySelectorAll(".sc-pipe"),
        { scaleX: 0 },
        { scaleX: 1, stagger: 0.1, duration: 0.35, transformOrigin: "left center" },
        0.15,
      )
      .fromTo(
        frame.querySelectorAll(".sc-amt"),
        { y: 16, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.1, duration: 0.4 },
        0.35,
      )
      .to({}, { duration: 1 });
  }

  if (scene === "notify") {
    tl.fromTo(
      frame.querySelectorAll(".sc-toast"),
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.16, duration: 0.45, ease: "power3.out" },
    )
      .to(frame.querySelector(".sc-toast"), { y: -3, duration: 0.6, yoyo: true, repeat: 1 })
      .to({}, { duration: 0.9 });
  }

  return tl;
}

function SceneMandate() {
  return (
    <div className="sc sc-mandate">
      <div className="sc-sheet">
        <header className="sc-sheet-head">
          <strong>Intent Mandate</strong>
          <span>AP2 · v1</span>
        </header>
        <p className="sc-sheet-title">Tokyo weekend authority</p>
        <div className="sc-line w70" />
        <div className="sc-line w45" />
        <div className="sc-kv">
          <span>Budget</span>
          <b>$900.00</b>
        </div>
        <div className="sc-kv">
          <span>City</span>
          <b>Tokyo</b>
        </div>
        <div className="sc-kv">
          <span>Max / payment</span>
          <b>$500.00</b>
        </div>
        <div className="sc-kv">
          <span>Merchants</span>
          <b>3 allowlisted</b>
        </div>
        <footer className="sc-sheet-foot">
          <span>Human signed</span>
          <em>M. Goyal</em>
        </footer>
      </div>
      <div className="sc-stamp">
        <span>SIGNED</span>
        <small>HSP</small>
      </div>
    </div>
  );
}

function SceneKey() {
  return (
    <div className="sc sc-key">
      <span className="sc-key-glow" />
      <div className="sc-cred">
        <div className="sc-cred-stripe" />
        <div className="sc-cred-chip" />
        <p>Bearer · scoped</p>
        <div className="sc-key-row">
          {"chlive_7f3a91c2".split("").map((c, i) => (
            <span key={i} className="sc-key-ch">
              {c}
            </span>
          ))}
        </div>
        <div className="sc-pills">
          <i>Grok</i>
          <i>/api/v1</i>
          <i>settle</i>
        </div>
      </div>
    </div>
  );
}

function SceneSettle() {
  return (
    <div className="sc sc-settle">
      <div className="sc-flow">
        <div className="sc-node">Offer</div>
        <i className="sc-pipe" />
        <div className="sc-node">Mandate</div>
        <i className="sc-pipe" />
        <div className="sc-node ok">HSP</div>
      </div>
      <div className="sc-ledger">
        <div className="sc-amt">
          <span>Hotel · Capsule Prime</span>
          <strong>$330</strong>
        </div>
        <div className="sc-amt">
          <span>Flight · SkyBridge</span>
          <strong>$380</strong>
        </div>
        <div className="sc-amt total">
          <span>Settled under charter</span>
          <strong>$710</strong>
        </div>
      </div>
    </div>
  );
}

function SceneNotify() {
  return (
    <div className="sc sc-notify">
      <div className="sc-toast">
        <div>
          <b>Telegram</b>
          <p>Settled · SkyBridge · $380</p>
        </div>
        <em>now</em>
      </div>
      <div className="sc-toast">
        <div>
          <b>AgentMail</b>
          <p>Settled · Capsule Prime · $330</p>
        </div>
        <em>2m</em>
      </div>
      <div className="sc-toast dim">
        <div>
          <b>Deny</b>
          <p>Blocked · Pacific Hop · merchant</p>
        </div>
        <em>5m</em>
      </div>
    </div>
  );
}
