import AppHeader from "../components/AppHeader.tsx";
import Card from "../components/Card.tsx";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { getCurrentUser, type CurrentUser } from "../Auth";

const summaries = [
  { title: "Mudelid", value: "0", detail: "Üles laetud 3D failid" },
  { title: "Projektid", value: "0", detail: "Avatud tööd" },
  { title: "Jagatud", value: "0", detail: "Lingid teistele" },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const currentUser = await getCurrentUser();

        if (!active) return;

        if (currentUser === null) {
          navigate("/login", { replace: true });
          return;
        }

        setUser(currentUser);
      } catch {
        if (active) {
          setError("Serveriga ühendamine ebaõnnestus.");
        }
      }
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, [navigate]);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!user) {
    return <p>Laadimine…</p>;
  }

  return (
    <>
      <AppHeader />
      <main className="dashboard">
        <h1>Tere, {user.username}</h1>
        <div className="card-grid">
          {summaries.map((item) => (
            <Card
              key={item.title}
              title={item.title}
              value={item.value}
              detail={item.detail}
            />
          ))}
        </div>
      </main>
    </>
  );
}
