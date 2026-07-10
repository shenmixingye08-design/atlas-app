/** Shared Clerk appearance — matches ATLAS light Apple identity. */
export const atlasClerkAppearance = {
  variables: {
    colorBackground: "#ffffff",
    colorText: "#1d1d1f",
    colorTextSecondary: "#6e6e73",
    colorPrimary: "#0071e3",
    colorDanger: "#d70015",
    colorSuccess: "#248a3d",
    colorInputBackground: "#f5f5f7",
    colorInputText: "#1d1d1f",
    borderRadius: "12px",
  },
  elements: {
    rootBox: "mx-auto w-full",
    card: "bg-transparent shadow-none border-0",
    headerTitle: "text-[#1d1d1f]",
    headerSubtitle: "text-[#6e6e73]",
    socialButtonsBlockButton:
      "border border-black/10 bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#ebebed]",
    formButtonPrimary: "bg-[#0071e3] hover:bg-[#0077ed]",
    footerActionLink: "text-[#0071e3] hover:text-[#0077ed]",
    formFieldInput:
      "border-black/10 bg-[#f5f5f7] text-[#1d1d1f] focus:border-[#0071e3]",
    identityPreviewEditButton: "text-[#0071e3]",
    userButtonPopoverCard: "border border-black/10 bg-white shadow-lg",
    userButtonPopoverActionButton: "text-[#1d1d1f] hover:bg-[#f5f5f7]",
    userButtonPopoverActionButtonText: "text-[#1d1d1f]",
    userButtonPopoverFooter: "hidden",
  },
};
