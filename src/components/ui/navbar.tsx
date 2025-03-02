import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Menu, X } from "lucide-react";

export const navItemsArr = [
  { name: "Home", href: "/" },
  { name: "Editor", href: "/editor" },
  { name: "Viewer", href: "/viewer" },
];

export const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useRouter();

  return (
    <nav className="bg-slate-900 text-white w-full z-50 shadow-md">
      <div className="container mx-auto flex justify-between items-center py-4 px-6">
        {/* Logo */}
        <Link href="/" className="text-xl font-semibold tracking-wide">
          Spec View
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex gap-6">
          {navItemsArr.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-lg transition ${
                pathname === item.href ? "text-teal-400 font-semibold" : "text-slate-300 hover:text-white"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden flex items-center"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {menuOpen && (
        <div className="md:hidden flex flex-col items-center bg-slate-800 py-4">
          {navItemsArr.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`py-2 text-lg w-full text-center transition ${
                pathname === item.href ? "text-teal-400 font-semibold" : "text-slate-300 hover:text-white"
              }`}
              onClick={() => setMenuOpen(false)}
            >
              {item.name}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
};