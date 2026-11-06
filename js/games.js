// Game Design section – shared behaviour (reveal on scroll, lightbox, presentation decks)
document.addEventListener("DOMContentLoaded", () => {
    if (window.feather) feather.replace();

    const deck = document.querySelector(".deck");
    const scroller = deck || window;

    // Reveal on scroll (same behaviour as the case study pages)
    const reveals = document.querySelectorAll(".reveal");
    const revealOnScroll = () => {
        const windowHeight = window.innerHeight;
        reveals.forEach((el) => {
            if (el.getBoundingClientRect().top < windowHeight - 60) el.classList.add("active");
        });
    };
    revealOnScroll();
    // Tailwind's CDN builds the styles after DOMContentLoaded, so the first check can run before
    // the final layout. Re-check once the page has loaded and after styles have settled.
    window.addEventListener("load", revealOnScroll);
    setTimeout(revealOnScroll, 300);
    setTimeout(revealOnScroll, 1000);
    window.addEventListener("resize", revealOnScroll, { passive: true });
    scroller.addEventListener("scroll", revealOnScroll, { passive: true });

    // Lightbox for gallery images
    const zoomables = document.querySelectorAll("img.zoomable");
    if (zoomables.length) {
        const box = document.createElement("div");
        box.className = "lightbox";
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-label", "Image preview");
        const big = document.createElement("img");
        box.appendChild(big);
        document.body.appendChild(box);
        const close = () => box.classList.remove("open");
        zoomables.forEach((img) =>
            img.addEventListener("click", () => {
                big.src = img.currentSrc || img.src;
                big.alt = img.alt;
                box.classList.add("open");
            })
        );
        box.addEventListener("click", close);
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    }

    // Presentation deck: counter, dots, keyboard navigation
    if (deck) {
        const slides = Array.from(deck.querySelectorAll(".slide"));
        const counter = document.getElementById("deck-counter");
        const dots = document.querySelector(".deck-dots");
        const pad = (n) => String(n).padStart(2, "0");
        let current = 0;

        slides.forEach((s, i) => {
            const b = document.createElement("button");
            b.setAttribute("aria-label", `Go to slide ${i + 1}`);
            b.addEventListener("click", () => go(i));
            dots && dots.appendChild(b);
        });

        const update = (i) => {
            current = i;
            if (counter) counter.textContent = `${pad(i + 1)} / ${pad(slides.length)}`;
            dots && dots.querySelectorAll("button").forEach((b, j) => b.classList.toggle("active", j === i));
        };
        const go = (i) => {
            i = Math.max(0, Math.min(slides.length - 1, i));
            update(i); // track the target right away so repeated key presses keep advancing
            target = i;
            clearTimeout(targetTimer);
            targetTimer = setTimeout(() => { target = null; }, 1500); // fallback if the user scrolls away
            slides[i].scrollIntoView({ behavior: "smooth" });
        };

        let target = null; // slide we are scrolling to programmatically
        let targetTimer;
        const io = new IntersectionObserver(
            (entries) => entries.forEach((en) => {
                if (!en.isIntersecting) return;
                const idx = slides.indexOf(en.target);
                if (target !== null && idx !== target) return; // ignore slides passed on the way
                target = null;
                update(idx);
            }),
            { root: deck, threshold: 0.55 }
        );
        slides.forEach((s) => io.observe(s));
        update(0);

        document.addEventListener("keydown", (e) => {
            if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(current + 1); }
            if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); go(current - 1); }
            if (e.key === "Home") { e.preventDefault(); go(0); }
            if (e.key === "End") { e.preventDefault(); go(slides.length - 1); }
        });
        document.getElementById("deck-prev")?.addEventListener("click", () => go(current - 1));
        document.getElementById("deck-next")?.addEventListener("click", () => go(current + 1));
    }
});
