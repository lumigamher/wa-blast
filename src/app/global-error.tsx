"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
          margin: 0,
          padding: "1rem",
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: "500px" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Algo salió mal
          </h1>
          <p style={{ fontSize: "0.875rem", opacity: 0.7, marginBottom: "1.5rem" }}>
            Ocurrió un error crítico en la aplicación. Por favor, intenta recargar la página.
            {error?.digest && ` (ID: ${error.digest})`}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "0.375rem",
              border: "none",
              background: "#3b82f6",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
              marginRight: "0.75rem",
            }}
          >
            Reintentar
          </button>
          <a
            href="/panel"
            style={{
              display: "inline-block",
              padding: "0.625rem 1.25rem",
              borderRadius: "0.375rem",
              border: "1px solid #444",
              background: "transparent",
              color: "#fafafa",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            Ir al inicio
          </a>
        </div>
      </body>
    </html>
  );
}
