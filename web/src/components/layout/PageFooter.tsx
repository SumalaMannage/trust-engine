import styles from "./PageFooter.module.css";

/** Privacy copy shown on every screen. */
export function PageFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p>
          No message history is kept between requests. Only the content you add is checked. Include the complete
          thread each time.
        </p>
      </div>
    </footer>
  );
}
