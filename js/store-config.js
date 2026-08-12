(() => {
  "use strict";

  const storeConfig = Object.freeze({
    whatsappNumber: "5491152627005",
    businessName: "Piedra, Papel o Tijera Librería",
    maxQuantityPerProduct: 99,
  });

  if (!/^[1-9]\d{7,14}$/.test(storeConfig.whatsappNumber)) {
    throw new TypeError("El número de WhatsApp configurado no es válido.");
  }

  Object.defineProperty(window, "PPT_STORE_CONFIG", {
    value: storeConfig,
    enumerable: true,
    writable: false,
    configurable: false,
  });

  function formatWhatsappNumber(number) {
    if (/^54911\d{8}$/.test(number)) {
      return `${number.slice(3, 5)}-${number.slice(5, 9)}-${number.slice(9)}`;
    }

    return `+${number}`;
  }

  function applyStoreConfig() {
    document.querySelectorAll("[data-whatsapp-link]").forEach((link) => {
      link.setAttribute("href", `https://wa.me/${storeConfig.whatsappNumber}`);
      link.setAttribute("rel", "noopener noreferrer");
    });

    document.querySelectorAll("[data-whatsapp-number]").forEach((element) => {
      element.textContent = formatWhatsappNumber(storeConfig.whatsappNumber);
    });

    if (!document.body?.hasAttribute("data-store-schema") || document.querySelector("#storeStructuredData")) {
      return;
    }

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "Store",
      name: storeConfig.businessName,
      image: new URL("img/og-image.jpg", document.baseURI).href,
      telephone: `+${storeConfig.whatsappNumber}`,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Polonia 1049",
        addressLocality: "José C. Paz",
        addressRegion: "Buenos Aires",
        postalCode: "B1660",
        addressCountry: "AR",
      },
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          opens: "07:00",
          closes: "13:30",
        },
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          opens: "16:00",
          closes: "20:00",
        },
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: "Saturday",
          opens: "09:00",
          closes: "13:00",
        },
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: "Saturday",
          opens: "16:00",
          closes: "20:00",
        },
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: "Sunday",
          opens: "09:00",
          closes: "13:00",
        },
      ],
      sameAs: ["https://instagram.com/piedrapapelotijeralibreria_"],
    };

    const schema = document.createElement("script");
    schema.id = "storeStructuredData";
    schema.type = "application/ld+json";
    schema.textContent = JSON.stringify(structuredData);
    document.head.append(schema);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyStoreConfig, { once: true });
  } else {
    applyStoreConfig();
  }
})();
