import styles from "./setup.module.css";
import { SetupClient } from "./setup.client";

export const Setup = () => (
  <main className={styles.page}>
    <SetupClient />
  </main>
);
