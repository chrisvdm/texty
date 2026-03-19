import styles from "./sandbox-provider.module.css";
import { SandboxProviderClient } from "./sandbox-provider.client";

export const SandboxProvider = () => (
  <main className={styles.page}>
    <SandboxProviderClient />
  </main>
);
