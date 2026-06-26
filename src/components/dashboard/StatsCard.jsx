import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";

export default function StatsCard({ 
  title, 
  value, 
  icon: Icon, 
  bgGradient, 
  trend, 
  trendUp = true,
  subtitle 
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="relative overflow-hidden bg-white/80 backdrop-blur-xl border border-slate-200/60 hover:shadow-xl transition-all duration-300">
        <div className={`absolute top-0 right-0 w-32 h-32 transform translate-x-12 -translate-y-12 bg-gradient-to-br ${bgGradient} rounded-full opacity-10`} />
        <CardContent className="p-6 relative">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-1">
                {title}
              </p>
              <p className="text-3xl font-bold text-slate-900 mb-1">
                {value}
              </p>
              {subtitle && (
                <p className="text-sm text-slate-500">{subtitle}</p>
              )}
            </div>
            <div className={`p-3 rounded-2xl bg-gradient-to-br ${bgGradient} shadow-lg`}>
              <Icon className="w-6 h-6 text-white" />
            </div>
          </div>
          
          {trend && (
            <div className="flex items-center text-sm">
              {trendUp ? (
                <TrendingUp className="w-4 h-4 mr-1 text-emerald-500" />
              ) : (
                <TrendingDown className="w-4 h-4 mr-1 text-red-500" />
              )}
              <span className={`font-medium ${trendUp ? 'text-emerald-600' : 'text-red-600'}`}>
                {trend}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}