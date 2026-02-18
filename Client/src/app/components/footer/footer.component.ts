import { Component } from "@angular/core";

@Component({
    selector: "app-footer",
    standalone: true,
    template: `
        <footer class="footer-container">
            <p class="copyright-year">&copy; Microsoft 2022</p>
        </footer>
    `,
    styleUrls: ["./footer.component.scss"],
})
export class FooterComponent {}
