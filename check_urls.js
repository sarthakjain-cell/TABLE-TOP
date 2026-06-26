const urls = [
  "https://upload.wikimedia.org/wikipedia/commons/3/3c/Chicken_makhni.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/a/ae/Dal_Makhani.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/5/54/Naan_with_Garlic_and_Butter.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/c/c4/Gulab_jamun_%28Dessert%29.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/c/c8/Samosa_chaat.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/2/22/Palak_paneer.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/c/c0/Chicken_tikka_masala.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/4/4d/Cheeseburger.jpg"
];

async function check() {
  for (const url of urls) {
    const res = await fetch(url, { method: 'HEAD' });
    console.log(url, res.status);
  }
}
check();
