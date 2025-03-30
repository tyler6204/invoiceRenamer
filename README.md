# Invoice Renamer

A desktop application for automatically extracting and renaming invoice files from PDFs and images.

## Features

- **Drag and Drop Interface**: Easily drag PDFs and images for processing
- **Invoice Detection**: Automatically identifies invoices in the dropped files
- **Smart Renaming**: Renames files based on invoice content
- **Batch Processing**: Process multiple files at once
- **File Duplication**: Create duplicates when multiple invoices are found in a single file
- **Automatic Updates**: Get notified when updates are available

## Note: Private Repository

This is a private repository. Access to the code and releases is restricted to authorized users only.

## Development

### Prerequisites

- Node.js (16+)
- pnpm

### Installation

```
# Clone the repository
$ git clone https://github.com/tyler6204/invoiceRenamer.git
$ cd invoiceRenamer

# Install dependencies
$ pnpm install --shamefully-hoist
```

### Usage

```
# Development mode
$ pnpm run dev

# Production build
$ pnpm run build

# Publish a new release with auto-update
$ export GH_TOKEN=your_github_token
$ pnpm run publish
```

## Auto-Update System

This application includes an automatic update system that:

1. Checks for updates when the application starts
2. Shows a notification when an update is available
3. Allows users to download and install updates with a single click

## Tech Stack

- **Nextron**: Electron + Next.js framework
- **shadcn/ui**: UI components
- **Tailwind CSS**: Styling
