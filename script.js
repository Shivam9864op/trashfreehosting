const particleContainer = document.getElementById("particles");
const statCounters = document.querySelectorAll("[data-count]");

const createParticles = () => {
  particleContainer.innerHTML = "";
  const count = Math.min(50, Math.floor(window.innerWidth / 25));
  for (let i = 0; i < count; i += 1) {
    const particle = document.createElement("span");
    particle.className = "particle";
    const size = Math.random() * 6 + 2;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 120}%`;
    particle.style.animationDuration = `${8 + Math.random() * 10}s`;
    particle.style.animationDelay = `${Math.random() * -10}s`;
    particleContainer.appendChild(particle);
  }
};

const animateCounters = () => {
  statCounters.forEach((counter) => {
    const target = Number(counter.dataset.count || 0);
    const duration = 1200;
    const startTime = performance.now();

    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const value = Math.floor(progress * target);
      counter.textContent = value.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  });
};

createParticles();
animateCounters();

window.addEventListener("resize", () => {
  createParticles();
});
