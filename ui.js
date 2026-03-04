export function toast(msg){
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>t.classList.add("hidden"), 2600);
}

export function setActiveNav(route){
  document.querySelectorAll(".nav-item").forEach(b=>{
    b.classList.toggle("active", b.dataset.route === route);
  });
}
