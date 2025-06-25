import localFont from "next/font/local";

// Configure SF Pro Rounded with all available weights
const sfProRounded = localFont({
  src: [
    {
      path: "../public/fonts/SF-Pro-Rounded-Ultralight.otf",
      weight: "100",
      style: "normal",
    },
    {
      path: "../public/fonts/SF-Pro-Rounded-Light.otf",
      weight: "200",
      style: "normal",
    },
    {
      path: "../public/fonts/SF-Pro-Rounded-Thin.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/SF-Pro-Rounded-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/SF-Pro-Rounded-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/SF-Pro-Rounded-Semibold.otf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/SF-Pro-Rounded-Bold.otf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/SF-Pro-Rounded-Heavy.otf",
      weight: "800",
      style: "normal",
    },
    {
      path: "../public/fonts/SF-Pro-Rounded-Black.otf",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-sf-pro-rounded",
  display: "swap", // Optimize font loading
});

export { sfProRounded };
