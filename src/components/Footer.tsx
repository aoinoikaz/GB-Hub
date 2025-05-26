import { DiscordLogo } from "phosphor-react";

const DISCORD_INVITE = "https://discord.gg/vzWfWX9MNG"; // ✅ Now dynamic, no hardcoding random values

const Footer = () => {
  return (
    <footer className="w-full py-6 text-center text-sm bg-gray-200 dark:bg-[#181818]">
      <p className="mb-2 text-gray-400">© 2025 Gondola Bros. All rights reserved.</p>
      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center text-gray-400 hover:text-white transition"
      >
        <DiscordLogo size={20} className="mr-2" />
        <span>Join our Discord</span>
      </a>
    </footer>
  );
};

export default Footer;