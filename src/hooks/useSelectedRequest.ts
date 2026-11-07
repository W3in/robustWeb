import { useCallback, useEffect, useState } from "react";

function readId(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get("request"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The open request is in the URL too (?request=<id>), so a detail view can be shared. */
export function useSelectedRequest(): [number | null, (id: number | null) => void] {
  const [selected, setSelected] = useState<number | null>(readId);

  useEffect(() => {
    const onPop = () => setSelected(readId());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const select = useCallback((id: number | null) => {
    const url = new URL(window.location.href);
    if (id === null) url.searchParams.delete("request");
    else url.searchParams.set("request", String(id));
    window.history.replaceState(window.history.state, "", url);
    setSelected(id);
  }, []);

  return [selected, select];
}
