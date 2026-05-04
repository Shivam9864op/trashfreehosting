/* ===========================
   ADMIN PANEL - standalone helpers
   (main admin logic lives in script.js AdminManager)
   =========================== */
document.addEventListener('DOMContentLoaded', () => {
  // Pulse animation on primary buttons
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.classList.add('pulse');
      setTimeout(() => btn.classList.remove('pulse'), 300);
    });
  });
});
