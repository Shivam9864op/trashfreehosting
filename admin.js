document.addEventListener('DOMContentLoaded', () => {
  // Admin panel placeholder interactions for future expansion
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.classList.add('pulse');
      setTimeout(() => btn.classList.remove('pulse'), 300);
    });
  });
});
